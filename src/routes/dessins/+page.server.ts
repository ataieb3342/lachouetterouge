import type { PageServerLoad } from './$types';
import { listerDessins } from '$lib/server/dessins';
import { presentDessin } from '$lib/server/present';

export const load: PageServerLoad = async () => ({ dessins: listerDessins().map(presentDessin) });
