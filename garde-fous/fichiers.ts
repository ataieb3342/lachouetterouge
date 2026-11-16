import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Outils communs aux garde-fous : retrouver et lire les fichiers du projet.
 * Les chemins sont toujours relatifs à la racine du dépôt, avec des `/`.
 */

export const RACINE = resolve(import.meta.dirname, '..');

/**
 * Ce que les garde-fous ne lisent pas : les jeux et les outils sont des
 * scripts autonomes écrits à part, `demo-image.ts` est une image encodée.
 */
const HORS_CHAMP = ['src/lib/jeux/', 'src/lib/boite-a-outils/', 'src/lib/server/demo-image.ts'];

export function lire(chemin: string): string {
	return readFileSync(join(RACINE, chemin), 'utf8');
}

/** Tous les fichiers d'un dossier dont le nom finit par l'une des extensions. */
export function lister(dossier: string, extensions: string[]): string[] {
	const trouves: string[] = [];
	const parcourir = (courant: string) => {
		for (const nom of readdirSync(courant)) {
			const complet = join(courant, nom);
			const chemin = relative(RACINE, complet).split('\\').join('/');
			if (HORS_CHAMP.some((exclu) => chemin.startsWith(exclu))) continue;
			if (statSync(complet).isDirectory()) parcourir(complet);
			else if (extensions.some((extension) => nom.endsWith(extension))) trouves.push(chemin);
		}
	};
	parcourir(join(RACINE, dossier));
	return trouves.sort();
}

/** Le code du site : ce que les règles de lisibilité et de charte regardent. */
export function fichiersDuSite(): string[] {
	return lister('src', ['.ts', '.js', '.svelte', '.css']);
}
