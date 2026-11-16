import { transaction } from '$lib/server/db';
import { envoyerEnRelecture, ErreurRelecture } from '$lib/server/relecture';
import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createPublication } from '$lib/server/content';
import { enregistrerALaUne } from '$lib/server/formulaires';
import { apercuPublication, ErreurFormulaire, lirePublication, valeursSaisies } from '$lib/server/formulaires';
import { audit, listAdminChoices } from '$lib/server/auth';

export const load: PageServerLoad = async ({ locals }) => ({
	adminCourantId: locals.admin!.id,
	admins: listAdminChoices().map(({ id, name, profile_public }) => ({
		id,
		name,
		profilePublic: !!profile_public
	}))
});

/**
 * Crée la publication ; renvoie son identifiant, ou l'échec à afficher. Avec
 * `envoyer`, l'article part aussitôt en relecture - dans la même transaction,
 * pour qu'un refus ne laisse pas un brouillon que personne n'a voulu créer.
 */
async function creer({ request, locals }: RequestEvent, envoyer = false) {
	const admin = locals.admin!;
	const form = await request.formData();
	try {
		const saisie = await lirePublication(form, admin.id, null);
		const id = transaction(() => {
			const nouvelle = createPublication(saisie, admin.id);
			if (envoyer) envoyerEnRelecture(nouvelle, admin.id);
			return nouvelle;
		});
		audit(admin, 'publication.creation', saisie.title, saisie.status, locals.ipHash);
		return id;
	} catch (err) {
		if (err instanceof ErreurFormulaire || err instanceof ErreurRelecture) {
			return fail(400, { ...valeursSaisies(form), erreur: err.message });
		}
		throw err;
	}
}

export const actions: Actions = {
	creer: async (event) => {
		const id = await creer(event);
		if (typeof id !== 'number') return id;
		redirect(303, `/admin/publications/${id}?enregistre=1`);
	},

	// « Enregistrer et envoyer en relecture » : le premier pas du parcours des
	// articles, fait dès la création.
	creerEtEnvoyer: async (event) => {
		const id = await creer(event, true);
		if (typeof id !== 'number') return id;
		redirect(303, '/admin/relecture?envoye=1');
	},

	// « Enregistrer et mettre à la une » : la publication est créée d'abord,
	// puis mise à la une si c'est possible. Ce qui l'empêche (un brouillon,
	// une une déjà pleine) est dit sur la page suivante, le texte étant déjà
	// enregistré.
	creerEtUne: async (event) => {
		const id = await creer(event);
		if (typeof id !== 'number') return id;
		const une = enregistrerALaUne(id, event.locals);
		redirect(303, `/admin/publications/${id}?enregistre=1&une=${une}`);
	},

	apercu: async ({ request }) => apercuPublication(await request.formData())
};
