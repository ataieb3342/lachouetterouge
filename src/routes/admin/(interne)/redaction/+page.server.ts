import { redirect } from '@sveltejs/kit';

// Cette page et sa voisine ont été réunies en une seule : Administration →
// Relecture. L'ancienne adresse reste, pour les favoris et les liens envoyés
// par message.
export const load = () => redirect(308, '/admin/relecture');
