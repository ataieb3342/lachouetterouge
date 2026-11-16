import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { importerFichier } from '$lib/server/comptes-rendus';

/**
 * Convertit un fichier `.docx` ou `.md` en texte pour remplir l'éditeur. Rien
 * n'est enregistré : la personne relit et corrige le résultat, et c'est
 * l'action `creer` qui enregistre.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.admin?.totpEnabled) error(403, 'Accès réservé aux administrateurs.');
	try {
		const form = await request.formData();
		const fichier = form.get('file');
		if (!(fichier instanceof File) || !fichier.size) throw new Error('Choisissez un fichier .docx ou .md.');
		const importe = await importerFichier(fichier);
		return json({ body: importe.body });
	} catch (erreur) {
		return json({ error: (erreur as Error).message }, { status: 400 });
	}
};
