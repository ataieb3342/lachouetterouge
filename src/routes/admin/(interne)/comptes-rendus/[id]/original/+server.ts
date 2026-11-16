import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { lireFichierOrigine, trouverCompteRendu } from '$lib/server/comptes-rendus';

/**
 * Le fichier d'origine d'un compte rendu, tel qu'il a été importé. Toujours
 * proposé en téléchargement (`attachment`), jamais affiché dans le
 * navigateur, et jamais gardé en cache : c'est un document interne.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.admin?.totpEnabled) error(403, 'Accès réservé aux administrateurs.');
	const compteRendu = trouverCompteRendu(Number(params.id));
	if (!compteRendu?.filename) error(404, 'Fichier introuvable.');

	let octets: Buffer;
	try {
		octets = await lireFichierOrigine(compteRendu);
	} catch {
		error(404, 'Fichier introuvable.');
	}

	// Deux noms : un nom simple que tout navigateur comprend, puis le nom
	// d'origine, encodé pour qu'aucun de ses caractères ne puisse sortir de
	// l'en-tête.
	const extension = compteRendu.filename.split('.').pop();
	const nomOrigine = encodeURIComponent(compteRendu.original_name).replace(
		/['()*]/g,
		(caractere) => '%' + caractere.charCodeAt(0).toString(16)
	);
	return new Response(new Uint8Array(octets), {
		headers: {
			'Content-Type': compteRendu.mime,
			'Content-Length': String(octets.length),
			'Content-Disposition': `attachment; filename="compte-rendu-${compteRendu.id}.${extension}"; filename*=UTF-8''${nomOrigine}`,
			'Cache-Control': 'private, no-store',
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
