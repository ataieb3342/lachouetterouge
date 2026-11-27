import test from 'node:test';
import assert from 'node:assert/strict';
import { LIEN_GROUPE, LIEN_REJOINDRE, LIENS_PRINCIPAUX, MENU_RESSOURCES, PIED_DE_PAGE } from '../src/lib/structure.ts';
import { KIND_PAR_RUBRIQUE, RUBRIQUE_PAR_KIND } from '../src/lib/rubriques.ts';
import { match as rubriqueAcceptee } from '../src/params/rubrique.ts';
import { lire } from './fichiers.ts';

/**
 * La structure du site est une décision du groupe, pas un détail technique.
 *
 * Ces tests comparent la navigation et les types de publication à ce qui a
 * été décidé. Ils échouent dès qu'on y touche - c'est leur rôle.
 *
 * VOUS VOULEZ AJOUTER UNE RUBRIQUE, ET CE TEST ÉCHOUE ?
 * Ne le modifiez pas pour le faire passer. Lisez d'abord l'en-tête de
 * `src/lib/structure.ts` : une nouvelle page va dans le menu Ressources ou
 * dans le pied de page, jamais dans les liens principaux. Si la structure
 * doit vraiment changer, c'est une décision à prendre avec le propriétaire du
 * dépôt - qui est de toute façon prévenu quand ce test échoue.
 */

const AIDE = '\n→ Lisez l’en-tête de src/lib/structure.ts avant de continuer.';

// L'agenda a été retiré le 26 novembre 2026 puis remis le lendemain, sur
// décision du groupe. Deux portes, toujours.
test('l’en-tête n’a que deux portes : Agenda et Articles', () => {
	assert.deepEqual(
		LIENS_PRINCIPAUX.map((lien) => lien.href),
		['/agenda', '/articles'],
		'Les liens principaux de l’en-tête ont changé. Une nouvelle page se range dans le menu Ressources.' + AIDE
	);
});

test('le menu Ressources contient les cinq pages décidées', () => {
	assert.equal(MENU_RESSOURCES.href, '/bibliotheque');
	assert.deepEqual(
		MENU_RESSOURCES.liens.map((lien) => lien.href),
		['/bibliotheque', '/boite-a-outils', '/jeux', '/dessins', '/medias'],
		'Le menu Ressources a changé : c’est possible, mais c’est une décision à faire relire.' + AIDE
	);
});

test('après le menu : « Qui sommes-nous ? » puis « Nous rejoindre »', () => {
	assert.equal(LIEN_GROUPE.href, '/le-groupe');
	assert.equal(LIEN_REJOINDRE.href, '/nous-rejoindre');
});

test('le pied de page a trois colonnes, et toute page de l’en-tête s’y retrouve', () => {
	assert.deepEqual(
		PIED_DE_PAGE.map((colonne) => colonne.titre),
		['Le groupe', 'Ressources', 'Le site']
	);
	const auPied = new Set<string>(PIED_DE_PAGE.flatMap((colonne) => colonne.liens.map((lien) => lien.href)));
	const enTete = [...LIENS_PRINCIPAUX, ...MENU_RESSOURCES.liens, LIEN_GROUPE, LIEN_REJOINDRE];
	for (const lien of enTete) {
		assert.ok(auPied.has(lien.href), `${lien.href} est dans l’en-tête mais pas dans le pied de page.`);
	}
});

test('l’en-tête est construit à partir de structure.ts, sans lien écrit à la main', () => {
	const gabarit = lire('src/routes/+layout.svelte');
	assert.match(gabarit, /LIENS_PRINCIPAUX/, 'Le gabarit du site ne lit plus structure.ts.');
	const enTete = gabarit.slice(gabarit.indexOf('<header'), gabarit.indexOf('</header>'));
	const liensEnDur = [...enTete.matchAll(/href="(\/[a-z][^"]*)"/g)].map((trouve) => trouve[1]);
	assert.deepEqual(
		liensEnDur,
		[],
		`Lien(s) écrit(s) directement dans l’en-tête : ${liensEnDur.join(', ')}. Ils doivent venir de structure.ts.` + AIDE
	);
});

test('trois types de publication, pas un de plus', () => {
	assert.deepEqual(
		KIND_PAR_RUBRIQUE,
		{ articles: 'article', actualites: 'actu', aperos: 'apero' },
		'Les types de publication ont changé. Il y en a eu sept, et c’était trop : avant d’en ajouter un, ' +
			'se demander s’il ne s’agit pas d’un article (voir CLAUDE.md, « Deux familles, quatre types de publication »).'
	);
	assert.deepEqual(RUBRIQUE_PAR_KIND, { article: 'articles', actu: 'actualites', apero: 'aperos' });

	// La route générique des rubriques ne capture rien d'autre. `revue-de-presse`
	// n'existe plus mais ses anciennes adresses redirigent.
	const candidates = ['articles', 'actualites', 'aperos', 'revue-de-presse', 'dessins', 'agenda', 'jeux', 'blog', 'breves'];
	assert.deepEqual(
		candidates.filter((nom) => rubriqueAcceptee(nom)),
		['articles', 'actualites', 'aperos', 'revue-de-presse']
	);
});
