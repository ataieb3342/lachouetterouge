import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { lireImageProposition, trouverProposition } from '$lib/server/propositions-dessins';

/**
 * L'image d'une proposition en attente, pour que l'équipe la voie avant de
 * décider. Elle n'est servie qu'à une session d'administration avec la double
 * authentification, et jamais gardée en cache : tant qu'elle n'est pas
 * acceptée, elle n'est pas publique.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.admin?.totpEnabled) error(403, 'Accès réservé à l’équipe.');
	const proposition = trouverProposition(Number(params.id));
	if (!proposition) error(404, 'Proposition introuvable.');

	let octets: Buffer;
	try {
		octets = await lireImageProposition(proposition);
	} catch {
		error(404, 'Image introuvable.');
	}
	return new Response(new Uint8Array(octets), {
		headers: {
			'Content-Type': proposition.mime,
			'Content-Length': String(octets.length),
			'Cache-Control': 'private, no-store',
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
