/**
 * Le site range ses publications en deux familles, d'après la question que se
 * pose le visiteur :
 *
 * - « Qu'est-ce que vous faites, qu'est-ce que vous pensez ? » : les
 *   articles, sans date de rendez-vous, en trois formats - actu, article,
 *   série (`format_article`, voir content.ts).
 * - « Où est-ce que je peux venir ? » : les apéros (`apero`), datés.
 *
 * Les événements et formations (`actu`) formaient avec les apéros l'agenda,
 * retiré le 26 novembre 2026. Le type reste : les anciennes fiches gardent
 * leur adresse sous /actualites/…, mais on n'en crée plus.
 *
 * La revue de presse, la brève et le retour d'action ont existé : sept types
 * pour un groupe local, c'était trop, et l'équipe elle-même se trompait de
 * case. Ils sont devenus des articles (migration 021). Leurs anciennes
 * adresses redirigent : /revue-de-presse vers /articles, /actualites vers
 * /aperos (voir `src/params/rubrique.ts`).
 */
export type Rubrique = 'articles' | 'actualites' | 'aperos';
export type Kind = 'article' | 'actu' | 'apero';

export const KIND_PAR_RUBRIQUE: Record<Rubrique, Kind> = {
	articles: 'article',
	actualites: 'actu',
	aperos: 'apero'
};

export const RUBRIQUE_PAR_KIND: Record<Kind, Rubrique> = {
	article: 'articles',
	actu: 'actualites',
	apero: 'aperos'
};

/**
 * La page qui liste une rubrique. Les anciens événements gardent leurs fiches
 * sous /actualites/… (des liens ont été partagés), mais aucune page ne les
 * liste plus depuis le retrait de l'agenda : leur fil d'Ariane s'arrête à
 * l'accueil.
 */
export const LISTE_RUBRIQUE: Record<Rubrique, string> = {
	articles: '/articles',
	actualites: '/',
	aperos: '/aperos'
};

export const TITRE_RUBRIQUE: Record<Rubrique, string> = {
	articles: 'Articles',
	actualites: 'Rendez-vous',
	aperos: 'Les apéros'
};

export const CHAPO_RUBRIQUE: Record<Rubrique, string> = {
	articles:
		'Ce qui se passe, ce qu’on en pense : des actus, des articles d’opinion sourcés, et des séries qui suivent un même fil, thème par thème.',
	actualites: 'Les anciens rendez-vous du groupe.',
	aperos:
		'Un thème choisi à l’avance, une discussion ouverte à toutes et tous autour d’un verre, puis un résumé des échanges publié ici.'
};

/**
 * Petites capitales affichées au-dessus du titre d'une rubrique, dans la
 * couleur du type de publication (`COULEUR_KIND` de format.ts), pour que
 * toutes les en-têtes se ressemblent et que chaque rubrique porte sa couleur
 * dès le premier coup d'œil.
 */
export const SURLIGNE_RUBRIQUE: Record<Rubrique, string> = {
	articles: 'Ce que nous faisons et pensons',
	actualites: 'Rendez-vous',
	aperos: 'Un lundi sur deux'
};
