/**
 * Retire le nom de l'auteur et les autres métadonnées des PDF déjà déposés
 * dans la bibliothèque.
 *
 * Depuis le 24 octobre 2026, `stockerPdf` nettoie chaque PDF avant de
 * l'écrire (`src/lib/server/metadonnees-pdf.ts`). Les PDF proposés avant sont
 * restés tels qu'ils étaient arrivés : ce script les reprend, une fois pour
 * toutes.
 *
 *     node --experimental-strip-types scripts/nettoyer-pdf.js              # essai : ne modifie rien
 *     node --experimental-strip-types scripts/nettoyer-pdf.js --appliquer  # nettoie
 *
 * Sur le serveur, passer par `scripts/nettoyer-pdf.sh` : le conteneur du site
 * n'a pas le code source, le script le lui prête (voir DEPLOIEMENT.md).
 *
 * Seuls les fichiers de la table `sources` sont lus : ce sont les seuls que le
 * site sert. Ceux qui attendent encore leur relecture sont nettoyés aussi.
 * Chaque fichier est réécrit d'un coup (un fichier provisoire, puis un
 * renommage) : un visiteur qui le demande pendant l'opération reçoit l'ancien
 * ou le nouveau, jamais un fichier à moitié écrit. Un PDF que le nettoyage ne
 * sait pas lire est laissé tel quel et signalé. Relancer le script ne change
 * rien aux PDF déjà propres.
 *
 * Le compte rendu affiche le nom inscrit comme auteur : c'est lui qui dit s'il
 * faut prévenir quelqu'un. Il n'est écrit nulle part ailleurs, ni dans le
 * journal d'audit, ni sur le disque.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { db } from '../src/lib/server/db.ts';
import { audit } from '../src/lib/server/auth.ts';
import { cheminPdf } from '../src/lib/server/bibliotheque.ts';
import { PdfIllisible, retirerMetadonneesPdf } from '../src/lib/server/metadonnees-pdf.ts';

const appliquer = process.argv.includes('--appliquer');

const sources = db()
	.prepare('select id, title, status, pdf_filename from sources where pdf_filename is not null order by id')
	.all();
const nettoyes = [];
const illisibles = [];
const absents = [];
let propres = 0;

for (const source of sources) {
	const chemin = cheminPdf(source.pdf_filename);
	if (!existsSync(chemin)) {
		absents.push(source);
		continue;
	}
	const avant = readFileSync(chemin);
	let resultat;
	try {
		resultat = retirerMetadonneesPdf(avant);
	} catch (e) {
		if (!(e instanceof PdfIllisible)) throw e;
		illisibles.push({ source, detail: e.detail });
		continue;
	}
	// Rien à retirer : le fichier reste tel quel, même si sa reconstruction
	// l'écrirait autrement.
	if (!resultat.retire.length) {
		propres++;
		continue;
	}
	nettoyes.push({ source, resultat, gain: avant.length - resultat.octets.length });

	if (appliquer) {
		const provisoire = `${chemin}.nettoyage`;
		writeFileSync(provisoire, resultat.octets, { mode: 0o644 });
		renameSync(provisoire, chemin);
		db().prepare('update sources set pdf_bytes = ? where id = ?').run(resultat.octets.length, source.id);
		const detail =
			`script de maintenance : ${resultat.retire.join(', ')}` +
			(resultat.auteur ? ' (dont un nom d’auteur)' : '') +
			(resultat.position ? ' (dont une position GPS)' : '');
		audit(null, 'pdf.nettoyage', source.pdf_filename, detail);
	}
}

/* ------------------------------------------------------------ compte rendu */

const ETATS = { approved: 'publié', pending: 'en attente', rejected: 'rejeté' };
const nom = (s) => `n° ${s.id} « ${s.title} » (${ETATS[s.status] ?? s.status}, ${s.pdf_filename})`;
const poids = (n) => (Math.abs(n) < 1024 ? `${n} octets` : `${Math.round(n / 1024)} Ko`);
const avecAuteur = nettoyes.filter((n) => n.resultat.auteur).length;
const avecPosition = nettoyes.filter((n) => n.resultat.position).length;

console.log(`PDF de la bibliothèque : ${sources.length}`);
console.log(`  déjà sans métadonnées : ${propres}`);
console.log(
	`  ${appliquer ? 'nettoyés' : 'à nettoyer'} : ${nettoyes.length}` +
		(avecAuteur ? `, dont ${avecAuteur} qui portaient un nom d’auteur` : '') +
		(avecPosition ? `, dont ${avecPosition} avec une photo qui indiquait l’endroit de la prise de vue` : '')
);
for (const { source, resultat, gain } of nettoyes) {
	const taille = gain >= 0 ? `${poids(gain)} en moins` : `${poids(-gain)} de plus`;
	const auteur = resultat.auteur ? ` - AUTEUR : « ${resultat.auteur} »` : '';
	const position = resultat.position ? ' - POSITION GPS' : '';
	console.log(`    - ${nom(source)} : ${resultat.retire.join(', ')}, ${taille}${auteur}${position}`);
}
if (illisibles.length) {
	console.log();
	console.log(`  illisibles, laissés tels quels : ${illisibles.length}`);
	for (const { source, detail } of illisibles) console.log(`    - ${nom(source)} : ${detail}`);
	console.log('    Ils gardent leurs métadonnées. Pour chacun : l’ouvrir et regarder ses propriétés');
	console.log('    (Fichier → Propriétés). Si un nom y figure, supprimer la source dans Administration →');
	console.log('    Sources des apéros, et demander à la personne d’en proposer une copie réenregistrée.');
}
if (absents.length) {
	console.log();
	console.log(`  inscrits en base mais absents du disque : ${absents.length}`);
	for (const source of absents) console.log(`    - ${nom(source)}`);
}
console.log();
if (!appliquer && nettoyes.length) {
	console.log('Essai seulement : aucun fichier n’a été modifié. Relancer avec --appliquer pour nettoyer.');
} else if (appliquer && nettoyes.length) {
	console.log('✓ PDF nettoyés. Chaque fichier modifié est noté dans le journal d’audit (pdf.nettoyage).');
} else {
	console.log('✓ Rien à faire.');
}
