import type { PageServerLoad } from './$types';
import { countApprovedSources, listAperosEntre, listPinnedPublished, listPublished } from '$lib/server/content';
import { presentMediaRecommande, presentPublication } from '$lib/server/present';
import { listMediasRecommandes } from '$lib/server/medias-recommandes';

/**
 * Apéros annoncés après le prochain, en une ligne sous sa fiche. Trois au
 * plus : au-delà, la ligne passe sur deux rangs, et la page des apéros les
 * montre tous.
 */
const APEROS_SUIVANTS = 3;
/** Derniers articles : deux rangées pleines de la grille de trois colonnes. */
const DERNIERS_ARTICLES = 6;

/** AAAA-MM-JJ à l'heure du serveur, comme `aVenir` de present.ts. */
function jourIso(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export const load: PageServerLoad = async () => {
	const articles = listPublished({ kind: 'article', limit: 12 }).map(presentPublication);
	// La une est choisie et rangée à la main (Administration → À la une). Si
	// elle est vide, la section disparaît au lieu d'y maintenir le dernier
	// article publié.
	const aLaUne = listPinnedPublished().map(presentPublication);
	const idsALaUne = new Set(aLaUne.map((publication) => publication.id));

	// Le bloc d'ouverture : le prochain apéro en grand, les suivants en une
	// ligne. Sans apéro annoncé, le dernier passé, pour lire son résumé : le
	// bloc ne reste jamais vide. Voir CLAUDE.md, « L'accueil ».
	const maintenant = new Date();
	const aujourdhui = jourIso(maintenant);
	const demain = jourIso(new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() + 1));
	const aVenir = listAperosEntre(aujourdhui, '9999-12-31').map(presentPublication);
	const prochain = aVenir[0] ?? null;
	// Le tri « archives » met les apéros à venir d'abord : sans apéro à venir,
	// le premier est le plus récent des passés.
	const dernier = prochain ? null : (listPublished({ kind: 'apero', ordre: 'archives', limit: 1 }).map(presentPublication)[0] ?? null);

	return {
		aLaUne,
		articles: articles.filter((article) => !idsALaUne.has(article.id)).slice(0, DERNIERS_ARTICLES),
		prochainApero: prochain
			? {
					...prochain,
					jour: prochain.eventAt === aujourdhui ? 'Aujourd’hui' : prochain.eventAt === demain ? 'Demain' : null,
					// Le dossier partagé : ce qu'on a déjà proposé de lire avant la soirée.
					sources: countApprovedSources(prochain.id)
				}
			: null,
		aperosSuivants: aVenir.slice(1, 1 + APEROS_SUIVANTS),
		dernierApero: dernier,
		// Les médias cochés « Sur l'accueil » dans l'administration.
		medias: listMediasRecommandes({ accueil: true }).map(presentMediaRecommande)
	};
};
