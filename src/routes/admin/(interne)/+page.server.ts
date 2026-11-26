import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { listAperosEntre } from '$lib/server/content';
import { recentAudit } from '$lib/server/auth';
import { picRecent, resumeFrequentation } from '$lib/server/frequentation';

/**
 * Le tableau de bord : ce qui attend quelqu'un, puis l'état du site.
 *
 * Il montrait aussi cinq compteurs (articles publiés, rendez-vous à venir…)
 * et les six dernières publications : des chiffres qui ne disaient quoi faire
 * à personne, et une liste que la page Publications donne déjà. Ils ont été
 * retirés en novembre 2026. Les éléments en attente de relecture (commentaires,
 * sources, dessins) viennent de `+layout.server.ts`, qui les compte pour les
 * pastilles du menu.
 */
export const load: PageServerLoad = async () => {
	const aujourdhui = new Date().toISOString().slice(0, 10);
	const brouillons = db()
		.prepare("select count(*) as n from publications where status = 'draft' and kind != 'actu'")
		.get() as { n: number };
	const prochain = listAperosEntre(aujourdhui, '9999-12-31')[0] ?? null;

	return {
		brouillons: brouillons.n,
		// Le prochain apéro annoncé : sans lui, l'accueil n'a rien à proposer.
		prochainApero: prochain ? { id: prochain.id, titre: prochain.title, date: prochain.event_at } : null,
		journal: recentAudit(8),
		frequentation: resumeFrequentation(),
		picRecent: picRecent()
	};
};
