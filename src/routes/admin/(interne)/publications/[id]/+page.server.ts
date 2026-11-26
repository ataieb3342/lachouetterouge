import { transaction } from '$lib/server/db';
import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { deletePublication, getById, positionALaUne, revisionArticle, updatePublication } from '$lib/server/content';
import { presentPublication } from '$lib/server/present';
import {
	apercuPublication,
	enregistrerALaUne,
	ErreurFormulaire,
	lirePublication,
	valeursSaisies,
	verifierRevision
} from '$lib/server/formulaires';
import { audit, listAdminChoices } from '$lib/server/auth';
import { choixSeries } from '$lib/server/series';

/**
 * La fiche d'une publication dans l'administration : la modifier, la mettre
 * en ligne ou l'en retirer (menu « État »), la mettre à la une, la supprimer.
 *
 * Toute l'équipe peut modifier toute publication. Le parcours de relecture à
 * quatre étapes, qui demandait une deuxième personne avant chaque mise en
 * ligne d'un article, a été retiré le 26 novembre 2026 : à quatre, il bloquait
 * plus qu'il ne protégeait. Ce qui reste de lui : le numéro de version, qui
 * empêche deux personnes d'enregistrer l'une par-dessus l'autre.
 */

function charger(id: string) {
	const publication = getById(Number(id));
	if (!publication) error(404, 'Publication introuvable');
	return publication;
}

export const load: PageServerLoad = async ({ params, url }) => {
	const publication = charger(params.id);
	return {
		publication: presentPublication(publication),
		admins: listAdminChoices().map(({ id, name, profile_public }) => ({
			id,
			name,
			profilePublic: !!profile_public
		})),
		corps: publication.body,
		series: choixSeries(),
		revision: revisionArticle(publication.id),
		positionUne: positionALaUne(publication.id),
		enregistre: url.searchParams.has('enregistre'),
		// Ce qu'a donné « Enregistrer et mettre à la une » : `ok`, `brouillon`
		// ou `pleine`.
		une: url.searchParams.get('une')
	};
};

/**
 * Enregistre le formulaire. Renvoie `null`, ou l'échec à afficher - avec ce
 * qui venait d'être saisi, pour que personne ne perde son texte.
 */
async function enregistrer({ request, params, locals }: RequestEvent<{ id: string }>) {
	const admin = locals.admin!;
	const publication = charger(params.id);
	const form = await request.formData();

	try {
		const saisie = await lirePublication(
			form,
			admin.id,
			publication.cover_media_id,
			publication.event_map_media_id,
			publication.kind
		);
		transaction(() => {
			verifierRevision(publication.id, Number(form.get('revision')));
			// L'URL n'est régénérée que si on le demande : les liens déjà
			// partagés sur les réseaux sociaux continuent de fonctionner.
			updatePublication(publication.id, saisie, { reslug: form.get('regenererUrl') === '1' });
		});

		// Une mise en ligne et un retrait se lisent à part dans le journal :
		// ce sont eux qu'on cherche quand quelque chose a paru par erreur.
		const action =
			saisie.status === publication.status
				? 'publication.modification'
				: saisie.status === 'published'
					? 'publication.publication'
					: 'publication.retrait';
		audit(admin, action, saisie.title, saisie.status, locals.ipHash);
		return null;
	} catch (err) {
		if (err instanceof ErreurFormulaire) return fail(400, { ...valeursSaisies(form), erreur: err.message });
		throw err;
	}
}

export const actions: Actions = {
	enregistrer: async (event) => {
		const echec = await enregistrer(event);
		if (echec) return echec;
		redirect(303, `/admin/publications/${event.params.id}?enregistre=1`);
	},

	// Enregistre d'abord, puis met à la une : le texte en cours n'est jamais
	// perdu, même quand la une refuse la fiche.
	enregistrerEtUne: async (event) => {
		const echec = await enregistrer(event);
		if (echec) return echec;
		const une = enregistrerALaUne(Number(event.params.id), event.locals);
		redirect(303, `/admin/publications/${event.params.id}?enregistre=1&une=${une}`);
	},

	apercu: async ({ request }) => apercuPublication(await request.formData()),

	supprimer: async ({ params, locals }) => {
		const admin = locals.admin!;
		const publication = charger(params.id);
		deletePublication(publication.id);
		// Les commentaires liés partent avec (clé étrangère en cascade).
		audit(admin, 'publication.suppression', publication.title, publication.slug, locals.ipHash);
		redirect(303, '/admin/publications');
	}
};
