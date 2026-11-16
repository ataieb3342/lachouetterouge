/**
 * La structure fixe du site : ce qu'il y a dans l'en-tête, dans le menu
 * Ressources et dans le pied de page.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ CE FICHIER EST VERROUILLÉ. On n'y ajoute pas une entrée « en passant ». │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Le site répond à deux questions, et l'en-tête n'a que deux portes :
 * « où est-ce que je peux venir ? » (l'agenda) et « qu'est-ce que vous faites,
 * qu'est-ce que vous pensez ? » (les articles). Tout le reste - ce qu'on
 * consulte ou dont on se sert - est rangé dans **Ressources**.
 *
 * Trois fois déjà, une rubrique de plus est arrivée dans l'en-tête parce
 * qu'une nouveauté semblait la mériter : la revue de presse, le menu
 * « Actualités » à sept entrées, puis les dessins. Chaque fois, l'en-tête a
 * débordé sur les écrans moyens et les visiteurs ne savaient plus où aller,
 * et il a fallu tout re-ranger.
 *
 * Une nouvelle page va donc :
 * - dans `MENU_RESSOURCES`, si c'est quelque chose qu'on consulte ou dont on
 *   se sert (et alors aussi en carte en bas de la bibliothèque) ;
 * - dans le pied de page seulement, si elle est secondaire ;
 * - **jamais** dans `LIENS_PRINCIPAUX`.
 *
 * `garde-fous/structure.test.ts` compare ce fichier à la liste décidée : le
 * modifier fait échouer les vérifications tant que le test n'a pas été mis à
 * jour dans le même changement, et le propriétaire du dépôt en est prévenu par
 * courriel. C'est voulu : ajouter une rubrique est une
 * décision du groupe, pas un détail technique. Voir aussi `CHARTE.md`.
 */

/**
 * Les deux portes du site. `sections` liste les adresses où le lien s'allume :
 * la fiche d'un événement est sous /actualites, celle d'un apéro sous /aperos.
 */
export const LIENS_PRINCIPAUX = [
	{ href: '/agenda', label: 'Agenda', sections: ['/agenda', '/actualites', '/aperos'] },
	{ href: '/articles', label: 'Articles', sections: ['/articles'] }
] as const;

/** Tout ce qu'on consulte ou dont on se sert, sans date. Le titre du menu mène à la bibliothèque. */
export const MENU_RESSOURCES = {
	href: '/bibliotheque',
	label: 'Ressources',
	liens: [
		{ href: '/bibliotheque', label: 'Bibliothèque' },
		{ href: '/boite-a-outils', label: 'Boîte à outils' },
		{ href: '/jeux', label: 'Jeux' },
		{ href: '/dessins', label: 'Dessins' },
		{ href: '/medias', label: 'Médias' }
	]
} as const;

/** Après le menu, toujours dans cet ordre : la présentation du groupe, puis le bouton. */
export const LIEN_GROUPE = { href: '/le-groupe', label: 'Qui sommes-nous ?' } as const;
export const LIEN_REJOINDRE = { href: '/nous-rejoindre', label: 'Nous rejoindre' } as const;

/**
 * Le pied de page reprend les familles de l'en-tête, une colonne chacune.
 * C'est aussi là que vont les pages absentes de l'en-tête de bureau.
 */
export const PIED_DE_PAGE = [
	{
		titre: 'Le groupe',
		liens: [
			{ href: '/le-groupe', label: 'Qui sommes-nous ?' },
			{ href: '/nous-rejoindre', label: 'Nous rejoindre' },
			{ href: '/agenda', label: 'Agenda' },
			{ href: '/aperos', label: 'Apéros' }
		]
	},
	{
		titre: 'Ressources',
		liens: [
			{ href: '/articles', label: 'Articles' },
			{ href: '/bibliotheque', label: 'Bibliothèque' },
			{ href: '/boite-a-outils', label: 'Boîte à outils' },
			{ href: '/jeux', label: 'Jeux' },
			{ href: '/dessins', label: 'Dessins et caricatures' },
			{ href: '/medias', label: 'Médias' }
		]
	},
	{
		titre: 'Le site',
		liens: [
			{ href: '/rss.xml', label: 'Flux RSS' },
			{ href: '/mentions-legales', label: 'Mentions légales' },
			{ href: '/confidentialite', label: 'Confidentialité' },
			{ href: '/admin', label: 'Administration' }
		]
	}
] as const;
