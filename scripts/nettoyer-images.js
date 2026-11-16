/**
 * Retire les métadonnées (position GPS, date, appareil…) des images déjà
 * enregistrées.
 *
 * Depuis le 23 octobre 2026, `storeUpload` nettoie chaque image avant de
 * l'écrire (`src/lib/server/metadonnees-images.ts`). Les images envoyées avant
 * sont restées telles qu'elles étaient arrivées : ce script les reprend, une
 * fois pour toutes.
 *
 *     node --experimental-strip-types scripts/nettoyer-images.js              # essai : ne modifie rien
 *     node --experimental-strip-types scripts/nettoyer-images.js --appliquer  # nettoie
 *
 * Sur le serveur, passer par `scripts/nettoyer-images.sh` : le conteneur du
 * site n'a pas le code source, le script le lui prête (voir DEPLOIEMENT.md).
 *
 * Seuls les fichiers de la table `media` sont lus : ce sont les seuls que le
 * site sert. Chaque fichier est réécrit d'un coup (un fichier provisoire, puis
 * un renommage) : un visiteur qui le demande pendant l'opération reçoit
 * l'ancien ou le nouveau, jamais un fichier à moitié écrit. Une image que le
 * nettoyage ne sait pas lire est laissée telle quelle et signalée. Relancer le
 * script ne change rien aux images déjà propres.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../src/lib/server/db.ts';
import { audit } from '../src/lib/server/auth.ts';
import { UPLOADS_DIR } from '../src/lib/server/media.ts';
import { ImageIllisible, retirerMetadonnees } from '../src/lib/server/metadonnees-images.ts';

const appliquer = process.argv.includes('--appliquer');

const medias = db().prepare('select id, filename, mime, alt from media order by id').all();
const nettoyees = [];
const illisibles = [];
const absentes = [];
let propres = 0;

for (const media of medias) {
	const chemin = join(UPLOADS_DIR, media.filename);
	if (!existsSync(chemin)) {
		absentes.push(media);
		continue;
	}
	const avant = readFileSync(chemin);
	let resultat;
	try {
		resultat = retirerMetadonnees(avant, media.mime);
	} catch (e) {
		if (!(e instanceof ImageIllisible)) throw e;
		illisibles.push({ media, detail: e.detail });
		continue;
	}
	if (resultat.octets.equals(avant)) {
		propres++;
		continue;
	}
	nettoyees.push({ media, resultat, gain: avant.length - resultat.octets.length });

	if (appliquer) {
		const provisoire = `${chemin}.nettoyage`;
		writeFileSync(provisoire, resultat.octets, { mode: 0o644 });
		renameSync(provisoire, chemin);
		db().prepare('update media set bytes = ? where id = ?').run(resultat.octets.length, media.id);
		const detail = `script de maintenance : ${resultat.retire.join(', ')}${resultat.position ? ' (dont une position GPS)' : ''}`;
		audit(null, 'image.nettoyage', media.filename, detail);
	}
}

/* ------------------------------------------------------------ compte rendu */

const nom = (m) => `n° ${m.id} « ${m.alt || 'sans description'} » (${m.filename})`;
const poids = (n) => (n < 1024 ? `${n} octets` : `${Math.round(n / 1024)} Ko`);
const avecPosition = nettoyees.filter((n) => n.resultat.position).length;

console.log(`Images enregistrées : ${medias.length}`);
console.log(`  déjà sans métadonnées : ${propres}`);
console.log(
	`  ${appliquer ? 'nettoyées' : 'à nettoyer'} : ${nettoyees.length}` +
		(avecPosition ? `, dont ${avecPosition} qui indiquaient l’endroit de la prise de vue` : '')
);
for (const { media, resultat, gain } of nettoyees) {
	const position = resultat.position ? ' - POSITION GPS' : '';
	// Un AVIF est effacé sur place, sans changer de taille (voir metadonnees-images.ts).
	const taille = gain > 0 ? `${poids(gain)} en moins` : 'effacé sur place';
	console.log(`    - ${nom(media)} : ${resultat.retire.join(', ')}, ${taille}${position}`);
}
if (illisibles.length) {
	console.log();
	console.log(`  illisibles, laissées telles quelles : ${illisibles.length}`);
	for (const { media, detail } of illisibles) console.log(`    - ${nom(media)} : ${detail}`);
	console.log('    Elles gardent leurs métadonnées. Pour chacune : la réenregistrer depuis son original,');
	console.log('    l’envoyer de nouveau, la mettre à la place de l’ancienne, puis supprimer l’ancienne.');
}
if (absentes.length) {
	console.log();
	console.log(`  inscrites en base mais absentes du disque : ${absentes.length}`);
	for (const media of absentes) console.log(`    - ${nom(media)}`);
}
console.log();
if (!appliquer && nettoyees.length) {
	console.log('Essai seulement : aucun fichier n’a été modifié. Relancer avec --appliquer pour nettoyer.');
} else if (appliquer && nettoyees.length) {
	console.log('✓ Images nettoyées. Chaque fichier modifié est noté dans le journal d’audit (image.nettoyage).');
} else {
	console.log('✓ Rien à faire.');
}
