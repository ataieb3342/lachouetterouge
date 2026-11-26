import test from 'node:test';
import assert from 'node:assert/strict';
import { fichiersDuSite, lire, lister } from './fichiers.ts';

/**
 * La charte graphique (`CHARTE.md`) et la lisibilité du code, pour ce qu'une
 * machine peut en vérifier.
 *
 * Chaque règle a ses exceptions, écrites ici avec leur raison. **La liste des
 * exceptions ne s'allonge pas pour faire passer un changement** : une
 * exception est une décision, relue comme telle.
 */

const pages = () => lister('src/routes', ['.svelte']);
const composants = () => [...pages(), ...lister('src/lib/components', ['.svelte'])];
const publiques = () => pages().filter((fichier) => !fichier.includes('/admin/'));

/** Les fichiers en faute, chacun avec ses premières occurrences, pour un message lisible. */
function enFaute(fichiers: string[], motif: RegExp, exceptions: string[] = []): string[] {
	const fautes: string[] = [];
	for (const fichier of fichiers) {
		if (exceptions.includes(fichier)) continue;
		const trouves = lire(fichier).match(motif);
		if (trouves) fautes.push(`${fichier} : ${[...new Set(trouves)].slice(0, 4).join(', ')}`);
	}
	return fautes;
}

test('couleurs : celles de la charte, pas la palette par défaut de Tailwind', () => {
	// `bg-red-50`, `text-green-900`… ne suivent ni la palette du site ni le thème
	// sombre. Une erreur s'affiche avec `.alerte`, une réussite avec
	// `.alerte-succes`, une surface avec `bg-carte` ou `bg-surface-alt`.
	const HORS_PALETTE =
		/\b(?:bg|text|border|ring|from|via|to|fill|stroke|outline|decoration)-(?:red|green|amber|gray|blue|yellow|slate|zinc|neutral|stone|orange|lime|emerald|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g;
	const EXCEPTIONS = [
		// Le bandeau « site de démonstration » et l'encadré de ses identifiants :
		// jaunes exprès, pour ne ressembler à rien d'autre sur le site.
		'src/routes/+layout.svelte',
		'src/routes/admin/connexion/+page.svelte'
	];
	assert.deepEqual(enFaute(composants(), HORS_PALETTE, EXCEPTIONS), [], 'Couleur hors charte (voir CHARTE.md, « Couleurs »).');
});

test('couleurs : aucune valeur écrite en dur dans une page', () => {
	// Une couleur en `#rrggbb` ne change pas avec le thème sombre et échappe à
	// toute retouche de la palette. Les couleurs sont des jetons d'`app.css`.
	const EXCEPTIONS = [
		// Les couleurs du logo : rouge, yeux ocre. Elles ne changent pas avec le
		// thème, comme un logo imprimé.
		'src/lib/components/Logo.svelte',
		// Les pastilles des fiches membres.
		'src/routes/le-groupe/+page.svelte',
		// Le bouton d'affichage actif, sur le pied de page toujours sombre.
		'src/routes/+layout.svelte'
	];
	assert.deepEqual(
		enFaute(composants(), /#[0-9a-fA-F]{6}\b/g, EXCEPTIONS),
		[],
		'Couleur écrite en dur : utilisez un jeton d’app.css (text-ink, bg-carte, text-brand…).'
	);
});

test('surfaces : jamais `.carte` sur une surface colorée', () => {
	// `.carte` est déclarée après dans app.css et écrase le fond : texte blanc
	// sur fond blanc.
	const MELANGE =
		/class="[^"]*\bcarte\b[^"]*\bfond-(?:degrade|actu|apero)\b[^"]*"|class="[^"]*\bfond-(?:degrade|actu|apero)\b[^"]*\bcarte\b[^"]*"/g;
	assert.deepEqual(enFaute(composants(), MELANGE), []);
});

test('texte sur fond rouge : `text-sur-brand`, jamais `text-white`', () => {
	// En thème sombre, le rouge devient un corail clair : le texte doit
	// devenir sombre. `text-white` reste blanc et devient illisible.
	const BLANC_SUR_ROUGE =
		/class="[^"]*\bbg-brand\b(?!-)[^"]*\btext-white\b[^"]*"|class="[^"]*\btext-white\b[^"]*\bbg-brand\b(?!-)[^"]*"/g;
	assert.deepEqual(enFaute(composants(), BLANC_SUR_ROUGE), []);
});

test('titres : `.titre-affiche` reste en casse normale, sans italique', () => {
	const DEFORME = /class="[^"]*\btitre-affiche\b[^"]*\b(?:italic|uppercase)\b[^"]*"|class="[^"]*\b(?:italic|uppercase)\b[^"]*\btitre-affiche\b[^"]*"/g;
	assert.deepEqual(enFaute(composants(), DEFORME), []);
});

test('rythme vertical : quatre valeurs sur les pages publiques, pas d’autres', () => {
	// py-6 pour <main>, pb-4 sous l'en-tête, mt-8 entre deux sections, mt-5 ou
	// mt-6 à l'intérieur. Les grandes marges rendaient chaque page différente
	// de sa voisine.
	const GRANDES_MARGES = /\b(?:mt|mb|my|pt|pb|py)-(?:10|12|14|16|20|24|28|32)\b/g;
	// La page d'erreur est seule sur son écran : elle se centre avec de l'air.
	const EXCEPTIONS = ['src/routes/+error.svelte'];
	assert.deepEqual(
		enFaute(publiques(), GRANDES_MARGES, EXCEPTIONS),
		[],
		'Marge hors échelle (voir CHARTE.md, « Espacements »).'
	);
});

test('toute page publique passe par `Metadonnees.svelte`', () => {
	// Une page qui écrit son propre <svelte:head> perd l'adresse canonique et
	// l'aperçu de partage, et personne ne s'en aperçoit avant des mois.
	const sansMetadonnees = publiques().filter(
		(fichier) => fichier.endsWith('+page.svelte') && !lire(fichier).includes('<Metadonnees')
	);
	assert.deepEqual(sansMetadonnees, [], 'Page publique sans <Metadonnees … />.');
	assert.deepEqual(enFaute(publiques(), /<svelte:head/g, ['src/routes/+error.svelte']), []);
});

test('lisibilité : pas de ligne interminable', () => {
	// Une ligne de 400 caractères ne se relit pas : c'est là que se cachent les
	// erreurs. Une instruction par ligne.
	const LIMITE = 250;
	const EXCEPTIONS = [
		// Des tracés SVG et des textes, qu'on ne coupe pas.
		'src/lib/components/Logo.svelte',
		'src/lib/components/Partage.svelte',
		'src/lib/article-layout.ts',
		'src/lib/speech-bubbles.ts',
		'src/lib/server/demo.ts',
		'src/lib/server/settings.ts',
		'src/app.css',
		'src/routes/confidentialite/+page.svelte',
		'src/routes/[rubrique=rubrique]/[slug]/+page.svelte'
	];
	const fautes: string[] = [];
	for (const fichier of fichiersDuSite()) {
		if (EXCEPTIONS.includes(fichier)) continue;
		const longues = lire(fichier)
			.split('\n')
			.map((ligne, i) => (ligne.length > LIMITE ? i + 1 : 0))
			.filter(Boolean);
		if (longues.length) fautes.push(`${fichier} : ligne(s) ${longues.slice(0, 5).join(', ')}`);
	}
	assert.deepEqual(fautes, [], `Ligne(s) de plus de ${LIMITE} caractères.`);
});

test('lisibilité : indentation par tabulations', () => {
	// Le code du projet est indenté par tabulations. Une ligne qui commence par
	// un seul espace est le signe d'un fichier collé tel quel depuis un outil.
	// db.ts : le SQL des migrations, qu'on ne retouche jamais.
	const EXCEPTIONS = ['src/lib/server/db.ts'];
	const fautes: string[] = [];
	for (const fichier of fichiersDuSite()) {
		if (EXCEPTIONS.includes(fichier)) continue;
		const nombre = lire(fichier)
			.split('\n')
			.filter((ligne) => /^ [^ *]/.test(ligne)).length;
		if (nombre) fautes.push(`${fichier} : ${nombre} ligne(s)`);
	}
	assert.deepEqual(fautes, [], 'Indentation par espaces : utilisez des tabulations.');
});
