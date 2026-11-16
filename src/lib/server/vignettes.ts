import sharp from 'sharp';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { UPLOADS_DIR, type Media } from './media.ts';

/**
 * Les vignettes de la galerie de dessins.
 *
 * Un dessin envoyé pèse jusqu'à 5 Mo ; une page qui en montre douze ferait
 * télécharger soixante mégaoctets. La galerie affiche donc une copie réduite
 * (`COTE_VIGNETTE` pixels au plus, en WebP), fabriquée à la première demande
 * puis gardée sur le disque dans `data/uploads/.thumbnails/`.
 *
 * La taille est fixe et ne vient jamais de l'adresse : un visiteur ne peut pas
 * faire calculer au serveur mille tailles différentes de la même image.
 *
 * C'est la seule raison d'être de `sharp` dans le projet. `media.ts` connaît
 * le nom du dossier pour effacer la vignette avec son image.
 */

const DOSSIER = join(UPLOADS_DIR, '.thumbnails');

/** Plus grand côté d'une vignette, en pixels. */
export const COTE_VIGNETTE = 640;

/** Les vignettes en cours de fabrication, pour ne pas calculer deux fois la même. */
const enCours = new Map<string, Promise<Buffer>>();

function cheminVignette(nomFichier: string): string {
	return join(DOSSIER, `${nomFichier}.webp`);
}

export async function obtenirVignette(media: Media): Promise<Buffer> {
	const chemin = cheminVignette(media.filename);
	try {
		return await readFile(chemin);
	} catch (erreur) {
		// Absente : on la fabrique. Toute autre erreur de lecture est une vraie panne.
		if ((erreur as NodeJS.ErrnoException).code !== 'ENOENT') throw erreur;
	}

	// Dix visiteurs qui ouvrent la galerie en même temps attendent le même calcul.
	const dejaLancee = enCours.get(media.filename);
	if (dejaLancee) return dejaLancee;

	const fabrication = (async () => {
		const octets = await sharp(join(UPLOADS_DIR, media.filename), { limitInputPixels: 40_000_000 })
			// Redresse une photo prise téléphone tenu en portrait.
			.rotate()
			.resize(COTE_VIGNETTE, COTE_VIGNETTE, { fit: 'inside', withoutEnlargement: true })
			.webp({ quality: 82, effort: 3 })
			.toBuffer();

		// Écrite sous un nom provisoire puis renommée : un autre visiteur ne lit
		// jamais un fichier à moitié écrit.
		await mkdir(DOSSIER, { recursive: true });
		const provisoire = `${chemin}.${randomUUID()}.tmp`;
		try {
			await writeFile(provisoire, octets, { flag: 'wx' });
			await rename(provisoire, chemin);
		} finally {
			await unlink(provisoire).catch(() => {});
		}
		return octets;
	})();

	enCours.set(media.filename, fabrication);
	try {
		return await fabrication;
	} finally {
		enCours.delete(media.filename);
	}
}
