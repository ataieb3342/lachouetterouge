import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getMediaByFilename } from '$lib/server/media';
import { obtenirVignette } from '$lib/server/vignettes';

/**
 * La copie réduite d'une image de la médiathèque, pour la galerie de dessins.
 * Seules les images connues de la base sont servies ; la taille est fixe (voir
 * `vignettes.ts`).
 */
export const GET: RequestHandler = async ({ params }) => {
	const media = getMediaByFilename(params.filename);
	if (!media) error(404, 'Image introuvable');

	let octets: Buffer;
	try {
		octets = await obtenirVignette(media);
	} catch {
		// La vignette n'a pas pu être fabriquée : l'image d'origine fait l'affaire.
		redirect(307, `/media/${media.filename}`);
	}
	return new Response(new Uint8Array(octets), {
		headers: {
			'Content-Type': 'image/webp',
			'Content-Length': String(octets.length),
			'X-Content-Type-Options': 'nosniff',
			// Le nom du fichier est aléatoire et son contenu ne change jamais.
			'Cache-Control': 'public, max-age=31536000, immutable'
		}
	});
};
