import { tableauRelecture } from '$lib/server/relecture';
import type { PageServerLoad } from './$types';

/**
 * Administration → Relecture : ce qui attend la personne connectée, puis ses
 * propres articles qui ne sont pas encore en ligne.
 */
export const load: PageServerLoad = ({ locals, url }) => ({
	...tableauRelecture(locals.admin!.id),
	envoye: url.searchParams.has('envoye')
});
