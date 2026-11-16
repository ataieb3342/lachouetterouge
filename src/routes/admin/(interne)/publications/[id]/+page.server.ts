import { transaction } from '$lib/server/db';
import { renderMarkdown } from '$lib/server/markdown';
import {
	demanderCorrections,
	droitsRelecture,
	envoyerEnRelecture,
	ErreurRelecture,
	historiqueRelecture,
	laisserUnMot,
	publierArticle,
	retirerDuSite,
	validerArticle,
	verifierModifiable,
	verifierVersion
} from '$lib/server/relecture';
import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { deletePublication, getById, positionALaUne, updatePublication } from '$lib/server/content';
import { presentPublication } from '$lib/server/present';
import {
	apercuPublication,
	enregistrerALaUne,
	ErreurFormulaire,
	lirePublication,
	valeursSaisies
} from '$lib/server/formulaires';
import { audit, listAdminChoices } from '$lib/server/auth';

function charger(id: string) {
	const publication = getById(Number(id));
	if (!publication) error(404, 'Publication introuvable');
	return publication;
}

export const load: PageServerLoad = async ({ params, url, locals }) => {
	const publication = charger(params.id);
	const droits = droitsRelecture(publication.id, locals.admin!.id);
	return {
		publication: presentPublication(publication),
		admins: listAdminChoices().map(({ id, name, profile_public }) => ({
			id,
			name,
			profilePublic: !!profile_public
		})),
		corps: publication.body,
		// Le parcours de relecture : ce que la personne connectée peut faire de
		// cet article, et ce qui s'est passé jusqu'ici. `etape` est nul pour un
		// rendez-vous, qui se publie directement.
		droits,
		historique: droits.etape ? historiqueRelecture(publication.id) : [],
		// Quand on ne peut pas modifier le texte, on le lit quand même.
		lecture: droits.peutModifier ? '' : renderMarkdown(publication.body),
		positionUne: positionALaUne(publication.id),
		enregistre: url.searchParams.has('enregistre'),
		// Ce qu'a donné « Enregistrer et mettre à la une » : `ok`, `brouillon`
		// ou `pleine`.
		une: url.searchParams.get('une')
	};
};

/** Ce qu'une action fait de l'article une fois le texte enregistré. */
type Suite = (id: number, adminId: number, form: FormData) => void;

/**
 * Enregistre le formulaire puis, s'il y a une `suite`, fait avancer l'article
 * d'une étape - le tout dans une seule transaction : un refus de la relecture
 * n'enregistre pas le texte à moitié, et inversement.
 *
 * Tous les boutons du parcours passent par ici, pour qu'aucun ne fasse perdre
 * le texte en cours. Renvoie `null`, ou l'échec à afficher.
 */
async function enregistrer({ request, params, locals }: RequestEvent<{ id: string }>, suite?: Suite) {
	const admin = locals.admin!;
	const publication = charger(params.id);
	const form = await request.formData();
	// Le formulaire complet n'est affiché qu'à qui peut modifier le texte. Les
	// autres n'envoient que leur mot : il n'y a alors rien à enregistrer.
	const avecTexte = form.has('title');

	try {
		let titre = publication.title;
		let etat: string = publication.status;

		if (avecTexte) {
			verifierModifiable(publication.id, admin.id);
			const saisie = await lirePublication(
				form,
				admin.id,
				publication.cover_media_id,
				publication.event_map_media_id
			);
			titre = saisie.title;
			etat = saisie.status;

			transaction(() => {
				if (publication.kind === 'article') {
					verifierVersion(publication.id, Number(form.get('revision')));
				}
				// L'URL n'est régénérée que si on le demande : les liens déjà
				// partagés sur les réseaux sociaux continuent de fonctionner.
				updatePublication(publication.id, saisie, { reslug: form.get('regenererUrl') === '1' });
				suite?.(publication.id, admin.id, form);
			});
		} else {
			if (!suite) throw new ErreurFormulaire('Rien à enregistrer.');
			suite(publication.id, admin.id, form);
		}

		audit(admin, 'publication.modification', titre, etat, locals.ipHash);
		return null;
	} catch (err) {
		if (err instanceof ErreurFormulaire || err instanceof ErreurRelecture) {
			return fail(400, { ...(avecTexte ? valeursSaisies(form) : {}), erreur: err.message });
		}
		throw err;
	}
}

/** Une action du parcours : enregistre, fait avancer l'article, revient sur la fiche. */
function etape(suite: Suite) {
	return async (event: RequestEvent<{ id: string }>) => {
		const echec = await enregistrer(event, suite);
		if (echec) return echec;
		redirect(303, `/admin/publications/${event.params.id}?enregistre=1`);
	};
}

export const actions: Actions = {
	enregistrer: etape(() => {}),

	// ------------------------------------------------- le parcours de relecture
	envoyer: etape((id, adminId) => envoyerEnRelecture(id, adminId)),
	valider: etape((id, adminId) => validerArticle(id, adminId)),
	corrections: etape((id, adminId, form) => demanderCorrections(id, adminId, String(form.get('mot') ?? ''))),
	mot: etape((id, adminId, form) => laisserUnMot(id, adminId, String(form.get('mot') ?? ''))),

	publier: async (event) => {
		let sansRelecture = false;
		const echec = await enregistrer(event, (id, adminId) => {
			sansRelecture = publierArticle(id, adminId);
		});
		if (echec) return echec;
		// Une mise en ligne sans relecture est permise au propriétaire du site,
		// mais elle doit se voir dans le journal.
		audit(
			event.locals.admin!,
			sansRelecture ? 'publication.sans-relecture' : 'publication.publication',
			event.params.id,
			'',
			event.locals.ipHash
		);
		redirect(303, `/admin/publications/${event.params.id}?enregistre=1`);
	},

	retirer: async (event) => {
		const echec = await enregistrer(event, (id, adminId) => retirerDuSite(id, adminId));
		if (echec) return echec;
		audit(event.locals.admin!, 'publication.retrait', event.params.id, '', event.locals.ipHash);
		redirect(303, `/admin/publications/${event.params.id}?enregistre=1`);
	},

	// ------------------------------------------------------------------ le reste

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

		try {
			verifierModifiable(publication.id, admin.id);
		} catch (err) {
			if (err instanceof ErreurRelecture) return fail(403, { erreur: err.message });
			throw err;
		}
		deletePublication(publication.id);
		// Les commentaires liés partent avec (clé étrangère en cascade).
		audit(admin, 'publication.suppression', publication.title, publication.slug, locals.ipHash);

		redirect(303, '/admin/publications');
	}
};
