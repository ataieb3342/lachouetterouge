import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listerDessins, trouverDessin } from '$lib/server/dessins';
import { presentDessin } from '$lib/server/present';

export const load: PageServerLoad = async ({ params }) => {
	const dessin = trouverDessin(Number(params.id));
	if (!dessin) error(404, 'Dessin introuvable.');

	// Les voisins dans la galerie, pour passer d'un dessin à l'autre sans y
	// revenir. Seuls les dessins publiés comptent.
	const dessins = listerDessins();
	const rang = dessins.findIndex((autre) => autre.id === dessin.id);
	const voisin = (position: number) =>
		dessins[position] ? { id: dessins[position].id, title: dessins[position].title } : null;

	return { dessin: presentDessin(dessin), precedent: voisin(rang - 1), suivant: voisin(rang + 1) };
};
