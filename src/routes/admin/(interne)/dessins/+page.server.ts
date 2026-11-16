import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { enregistrerDessin, lireChampsDessin, listerDessins, supprimerDessin, trouverDessin } from '$lib/server/dessins';
import {
	accepterProposition,
	listerPropositions,
	refuserProposition,
	trouverProposition
} from '$lib/server/propositions-dessins';
import { presentDessin, presentPropositionDessin } from '$lib/server/present';
import { storeUpload } from '$lib/server/media';
import { audit } from '$lib/server/auth';

/**
 * Administration → Dessins : les propositions des visiteurs à trier, puis les
 * fiches de la galerie.
 *
 * Chaque action revérifie la session et la double authentification : le
 * `+layout.server.ts` de l'administration protège l'affichage des pages, pas
 * les actions de formulaire, qui s'exécutent avant lui.
 */

const REFUS = { erreur: 'Accès réservé à l’équipe.' };

export const load: PageServerLoad = async () => ({
	dessins: listerDessins(true).map(presentDessin),
	propositions: listerPropositions().map(presentPropositionDessin)
});

export const actions: Actions = {
	accepter: async ({ request, locals }) => {
		if (!locals.admin?.totpEnabled) return fail(403, REFUS);
		const form = await request.formData();
		const id = Number(form.get('submissionId'));
		if (!trouverProposition(id)) return fail(404, { erreur: 'Proposition déjà traitée.' });

		let dessinId: number;
		try {
			// La case d'autorisation a été cochée par la personne qui a proposé le
			// dessin : l'équipe peut corriger les champs, pas la recocher.
			dessinId = await accepterProposition(id, lireChampsDessin(form, false), locals.admin.id);
		} catch (erreur) {
			return fail(400, { erreur: (erreur as Error).message });
		}
		audit(locals.admin, 'dessin.acceptation', String(id), `dessin:${dessinId}`, locals.ipHash);
		redirect(303, '/admin/dessins');
	},

	refuser: async ({ request, locals }) => {
		if (!locals.admin?.totpEnabled) return fail(403, REFUS);
		const id = Number((await request.formData()).get('submissionId'));
		if (!trouverProposition(id)) return fail(404, { erreur: 'Proposition déjà traitée.' });

		await refuserProposition(id);
		audit(locals.admin, 'dessin.refus', String(id), '', locals.ipHash);
		redirect(303, '/admin/dessins');
	},

	enregistrer: async ({ request, locals }) => {
		if (!locals.admin?.totpEnabled) return fail(403, REFUS);
		const form = await request.formData();
		const idSaisi = String(form.get('id') ?? '');
		const id = idSaisi ? Number(idSaisi) : null;
		const existant = id === null ? undefined : trouverDessin(id, true);
		if (id !== null && !existant) return fail(404, { erreur: 'Dessin introuvable.' });

		let dessinId: number;
		try {
			const champs = lireChampsDessin(form);
			const fichier = form.get('image');
			// Sans nouveau fichier, la fiche garde son image.
			let mediaId = existant?.media_id;
			if (fichier instanceof File && fichier.size > 0) {
				mediaId = (await storeUpload(fichier, champs.alt, locals.admin.id)).id;
			}
			if (!mediaId) return fail(400, { erreur: 'Choisissez une image.' });
			dessinId = enregistrerDessin(id, champs, mediaId);
		} catch (erreur) {
			return fail(400, { erreur: (erreur as Error).message });
		}
		audit(locals.admin, id ? 'dessin.modification' : 'dessin.creation', String(dessinId), '', locals.ipHash);
		redirect(303, '/admin/dessins');
	},

	supprimer: async ({ request, locals }) => {
		if (!locals.admin?.totpEnabled) return fail(403, REFUS);
		const dessin = trouverDessin(Number((await request.formData()).get('id')), true);
		if (!dessin) return fail(404, { erreur: 'Dessin introuvable.' });

		supprimerDessin(dessin.id);
		audit(locals.admin, 'dessin.suppression', String(dessin.id), dessin.title, locals.ipHash);
		redirect(303, '/admin/dessins');
	}
};
