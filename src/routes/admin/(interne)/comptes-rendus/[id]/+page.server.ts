import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	cocherTache,
	lireChampsCompteRendu,
	modifierCompteRendu,
	rendreCompteRendu,
	supprimerCompteRendu,
	trouverCompteRendu
} from '$lib/server/comptes-rendus';
import { presentCompteRendu } from '$lib/server/present';
import { audit } from '$lib/server/auth';

const REFUS = { erreur: 'Accès réservé aux administrateurs.' };

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.admin?.totpEnabled) error(403, REFUS.erreur);
	const compteRendu = trouverCompteRendu(Number(params.id));
	if (!compteRendu) error(404, 'Compte rendu introuvable.');
	return { compteRendu: presentCompteRendu(compteRendu), html: rendreCompteRendu(compteRendu.body) };
};

export const actions: Actions = {
	// Coche ou décoche une tâche depuis la page de lecture, sans ouvrir l'éditeur.
	cocher: async ({ locals, params, request }) => {
		if (!locals.admin?.totpEnabled) return fail(403, REFUS);
		const id = Number(params.id);
		const compteRendu = trouverCompteRendu(id);
		if (!compteRendu) error(404, 'Compte rendu introuvable.');

		try {
			const form = await request.formData();
			const cochee = String(form.get('checked'));
			if (!['true', 'false'].includes(cochee)) throw new Error('État de case invalide.');
			const ligne = String(form.get('taskLine') ?? '');
			if (!/^\d+$/.test(ligne)) throw new Error('Case invalide.');

			const texte = cocherTache(compteRendu.body, Number(ligne), cochee === 'true');
			modifierCompteRendu(
				id,
				{ title: compteRendu.title, date: compteRendu.meeting_date, body: texte },
				String(form.get('version') ?? '')
			);
		} catch (erreur) {
			return fail(400, { erreur: (erreur as Error).message });
		}
		audit(locals.admin, 'compte-rendu.tache', String(id), '', locals.ipHash);
		return { tacheEnregistree: true };
	},

	enregistrer: async ({ locals, params, request }) => {
		if (!locals.admin?.totpEnabled) return fail(403, REFUS);
		const id = Number(params.id);
		if (!trouverCompteRendu(id)) error(404, 'Compte rendu introuvable.');

		try {
			const form = await request.formData();
			modifierCompteRendu(id, lireChampsCompteRendu(form), String(form.get('version') ?? ''));
		} catch (erreur) {
			return fail(400, { erreur: (erreur as Error).message });
		}
		audit(locals.admin, 'compte-rendu.modification', String(id), '', locals.ipHash);
		redirect(303, `/admin/comptes-rendus/${id}`);
	},

	supprimer: async ({ locals, params }) => {
		if (!locals.admin?.totpEnabled) return fail(403, REFUS);
		const id = Number(params.id);
		if (!trouverCompteRendu(id)) error(404, 'Compte rendu introuvable.');

		await supprimerCompteRendu(id);
		audit(locals.admin, 'compte-rendu.suppression', String(id), '', locals.ipHash);
		redirect(303, '/admin/comptes-rendus');
	}
};
