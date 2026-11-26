import type { PageServerLoad } from './$types';
import { listSeries } from '$lib/server/series';

/**
 * /series : la liste des séries d'articles, dans l'ordre choisi dans
 * Administration → Séries. Seules celles qui ont au moins un article en
 * ligne sont montrées : une série vide mènerait à une page sans contenu.
 */
export const load: PageServerLoad = async () => ({
	series: listSeries()
		.filter((serie) => serie.en_ligne > 0)
		.map((serie) => ({
			slug: serie.slug,
			titre: serie.titre,
			presentation: serie.presentation,
			articles: serie.en_ligne
		}))
});
