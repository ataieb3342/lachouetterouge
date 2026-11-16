import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	creerCompteRendu,
	importerFichier,
	lireChampsCompteRendu,
	listerComptesRendus
} from '$lib/server/comptes-rendus';
import { presentResumeCompteRendu } from '$lib/server/present';
import { audit } from '$lib/server/auth';

/**
 * La liste des comptes rendus de réunion et le formulaire d'ajout.
 *
 * La session et la double authentification sont revérifiées ici et dans
 * chaque action : ces documents sont internes, on ne s'en remet pas au seul
 * `+layout.server.ts`, qui ne protège pas les actions de formulaire.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.admin?.totpEnabled) error(403, 'Accès réservé aux administrateurs.');
	const recherche = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
	return { recherche, comptesRendus: listerComptesRendus(recherche).map(presentResumeCompteRendu) };
};

export const actions: Actions = {
	creer: async ({ locals, request }) => {
		if (!locals.admin?.totpEnabled) return fail(403, { erreur: 'Accès réservé aux administrateurs.' });

		let id: number;
		try {
			const form = await request.formData();
			const champs = lireChampsCompteRendu(form);
			const fichier = form.get('file');
			const importe = fichier instanceof File && fichier.size ? await importerFichier(fichier) : null;
			// Le texte de l'éditeur l'emporte sur la conversion automatique : la
			// personne a pu le corriger après l'import. Le fichier d'origine, lui,
			// est gardé tel quel.
			if (importe && champs.body) importe.body = champs.body;
			id = await creerCompteRendu(champs, importe, locals.admin.id);
		} catch (erreur) {
			return fail(400, { erreur: (erreur as Error).message });
		}
		audit(locals.admin, 'compte-rendu.creation', String(id), '', locals.ipHash);
		redirect(303, `/admin/comptes-rendus/${id}`);
	}
};
