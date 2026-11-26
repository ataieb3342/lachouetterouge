import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { countPublished, FORMATS_ARTICLE, listPublished, type FormatArticle } from '$lib/server/content';
import { presentPublication } from '$lib/server/present';
import { listSeries } from '$lib/server/series';

/**
 * La première page s'ouvre sur l'article le plus récent en grand, puis une
 * grille de trois colonnes : 1 + 12, soit quatre rangées pleines. Les pages
 * suivantes n'ont pas de grand article, d'où douze.
 */
const PREMIERE_PAGE = 13;
const PAR_PAGE = 12;

/**
 * La seule liste servie ici est celle des articles : les apéros ont leur
 * page. Les anciennes listes redirigent, filtres compris : /actualites était
 * la liste des événements, puis renvoyait à l'agenda ; l'agenda retiré
 * (novembre 2026), elle renvoie aux apéros comme /agenda.
 */
export const load: PageServerLoad = async ({ params, url }) => {
	if (params.rubrique === 'actualites') redirect(301, '/aperos');
	if (params.rubrique === 'revue-de-presse') redirect(301, '/articles');

	// Le filtre par format (`?format=actu|article|serie`) passe par l'adresse,
	// comme la pagination : il fonctionne sans JavaScript et se partage. Une
	// valeur inconnue est ignorée plutôt que de donner une page vide.
	const demande = url.searchParams.get('format');
	const format = FORMATS_ARTICLE.includes(demande as FormatArticle) ? (demande as FormatArticle) : null;

	const total = countPublished('article', undefined, format ?? undefined);
	const pages = total <= PREMIERE_PAGE ? 1 : 1 + Math.ceil((total - PREMIERE_PAGE) / PAR_PAGE);
	// Le numéro de page est borné aux pages qui existent, comme dans la
	// bibliothèque. Sans cela, `?page=99` renvoyait une liste vide, indexable,
	// qui se désignait elle-même comme canonique : une page vide de plus aux
	// yeux du moteur, et autant qu'on peut taper de numéros.
	const page = Math.min(Math.max(1, Number(url.searchParams.get('page')) || 1), pages);
	const publications = listPublished({
		kind: 'article',
		format: format ?? undefined,
		limit: page === 1 ? PREMIERE_PAGE : PAR_PAGE,
		offset: page === 1 ? 0 : PREMIERE_PAGE + (page - 2) * PAR_PAGE
	});

	return {
		page,
		pages,
		total,
		format,
		publications: publications.map(presentPublication),
		// Les séries qui ont au moins un article en ligne : une série vide
		// mènerait à une page qui ne contient rien.
		series: listSeries()
			.filter((serie) => serie.en_ligne > 0)
			.map((serie) => ({ titre: serie.titre, slug: serie.slug, articles: serie.en_ligne }))
	};
};
