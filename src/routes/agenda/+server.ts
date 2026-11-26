import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * L'agenda (événements, formations et apéros, en liste ou en calendrier) a
 * été retiré le 26 novembre 2026 : le groupe ne garde que ses apéros. Les
 * liens déjà partagés vers /agenda, filtres et mois compris, mènent à la
 * page des apéros, la seule liste de rendez-vous qui reste. Redirection
 * permanente : les moteurs de recherche reportent l'adresse sur /aperos.
 *
 * Voir CLAUDE.md, « L'agenda (retiré) ».
 */
export const GET: RequestHandler = () => redirect(301, '/aperos');
