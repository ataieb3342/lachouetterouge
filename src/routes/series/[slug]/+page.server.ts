import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listArticlesDeSerie } from '$lib/server/content';
import { presentPublication } from '$lib/server/present';
import { getSerieParSlug } from '$lib/server/series';

/**
 * La page d'une série : sa présentation, puis ses articles en ligne dans
 * l'ordre de lecture (le rang choisi dans le formulaire, puis la date).
 */
export const load: PageServerLoad = async ({ params }) => {
	const serie = getSerieParSlug(params.slug);
	if (!serie) error(404, 'Série introuvable');
	return {
		serie: { slug: serie.slug, titre: serie.titre, presentation: serie.presentation },
		articles: listArticlesDeSerie(serie.id).map(presentPublication)
	};
};
