import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { audit } from '$lib/server/auth';
import {
	creerSerie,
	deplacerSerie,
	getSerie,
	lireChampsSerie,
	listSeries,
	modifierSerie,
	supprimerSerie
} from '$lib/server/series';

/**
 * Administration → Séries : les fils conducteurs que suivent plusieurs
 * articles (voir `series.ts`). On crée la série ici, puis chaque article la
 * choisit dans son formulaire, au format « Série ».
 *
 * Chaque action passe par `audit()` : une série est une ligne éditoriale du
 * groupe, on doit savoir qui l'a ouverte, renommée ou supprimée.
 */
export const load: PageServerLoad = async () => ({
	series: listSeries().map((serie) => ({
		id: serie.id,
		slug: serie.slug,
		titre: serie.titre,
		presentation: serie.presentation,
		articles: serie.articles,
		enLigne: serie.en_ligne
	}))
});

export const actions: Actions = {
	ajouter: async ({ request, locals }) => {
		const admin = locals.admin!;
		const champs = lireChampsSerie(await request.formData());
		if ('erreur' in champs) return fail(400, { erreur: champs.erreur });
		creerSerie(champs);
		audit(admin, 'serie.ajout', champs.titre, '', locals.ipHash);
		redirect(303, '/admin/series');
	},

	modifier: async ({ request, locals }) => {
		const admin = locals.admin!;
		const form = await request.formData();
		const serie = getSerie(Number(form.get('id')));
		if (!serie) return fail(404, { erreur: 'Série introuvable.' });
		const champs = lireChampsSerie(form);
		if ('erreur' in champs) return fail(400, { erreur: champs.erreur, id: serie.id });
		modifierSerie(serie.id, champs);
		audit(admin, 'serie.modification', champs.titre, serie.titre, locals.ipHash);
		redirect(303, '/admin/series');
	},

	deplacer: async ({ request }) => {
		const form = await request.formData();
		deplacerSerie(Number(form.get('id')), form.get('sens') === 'haut' ? 'haut' : 'bas');
		redirect(303, '/admin/series');
	},

	supprimer: async ({ request, locals }) => {
		const admin = locals.admin!;
		const serie = getSerie(Number((await request.formData()).get('id')));
		if (!serie) return fail(404, { erreur: 'Série introuvable.' });
		if (supprimerSerie(serie.id) === 'pas-vide') {
			return fail(400, {
				erreur: `« ${serie.titre} » contient encore des articles. Rattachez-les à une autre série ou changez leur format avant de la supprimer.`
			});
		}
		audit(admin, 'serie.suppression', serie.titre, '', locals.ipHash);
		redirect(303, '/admin/series');
	}
};
