import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createChallenge, verifySolution } from '$lib/server/captcha';
import { rateLimit } from '$lib/server/ratelimit';
import { isIpBlocked } from '$lib/server/content';
import { creerProposition } from '$lib/server/propositions-dessins';
import { lireChampsDessin } from '$lib/server/dessins';

/**
 * Le formulaire public « Proposer un dessin ».
 *
 * Même circuit que les commentaires et les sources des apéros : champ-piège,
 * preuve de travail, quotas par empreinte d'adresse. Et comme pour les
 * sources, la relecture est systématique : rien n'est publié sans qu'une
 * personne de l'équipe ait vu l'image.
 */

const HEURE = 3600_000;
const JOUR = 24 * HEURE;

/** Une image de 5 Mo, plus la place des champs de texte du formulaire. */
const TAILLE_MAX_REQUETE = 5 * 1024 * 1024 + 64 * 1024;

/** Envois par jour et par origine : un seul sans preuve de travail, cinq avec. */
const QUOTA_SANS_PREUVE = 1;
const QUOTA_AVEC_PREUVE = 5;

/** Envois par jour pour tout le site : le plafond qui tient face à mille adresses. */
const QUOTA_DU_SITE = 100;

export const load: PageServerLoad = async () => ({ defi: createChallenge() });

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const vide: Record<string, string> = {};
		// Ce que voit quelqu'un dont l'envoi est écarté en silence (origine
		// bloquée, champ-piège rempli) : exactement le message de réussite, pour
		// ne pas lui apprendre à contourner le filtre.
		const reussite = { envoye: true, erreur: '', valeurs: vide };
		const echec = (code: number, erreur: string, valeurs = vide) => fail(code, { envoye: false, erreur, valeurs });

		if (isIpBlocked(locals.ipHash)) return reussite;
		if (!rateLimit(`drawing:attempt:${locals.ipHash}`, 10, HEURE).ok) {
			return echec(429, 'Trop de tentatives. Réessayez dans une heure.');
		}
		// Refusé avant de lire le corps de la requête : on ne charge pas en
		// mémoire un fichier qu'on sait déjà trop gros.
		if (Number(request.headers.get('content-length') || 0) > TAILLE_MAX_REQUETE) {
			return echec(413, 'Choisissez une image de 5 Mo maximum.');
		}

		let form: FormData;
		try {
			form = await request.formData();
		} catch {
			return echec(400, 'Envoi illisible. Réessayez avec le formulaire.');
		}

		// Renvoyé au formulaire après une erreur, pour ne pas tout retaper.
		const valeurs: Record<string, string> = {};
		for (const champ of ['title', 'author', 'caption', 'alt', 'rights']) {
			valeurs[champ] = String(form.get(champ) ?? '').slice(0, 2000);
		}

		// Champ-piège : invisible pour un humain, rempli par les robots.
		if (String(form.get('site') ?? '')) return reussite;

		try {
			const champs = lireChampsDessin(form);
			const fichier = form.get('image');
			if (!(fichier instanceof File) || !fichier.size) return echec(400, 'Choisissez un dessin à envoyer.', valeurs);

			// Sans JavaScript, pas de preuve de travail : l'envoi reste possible,
			// mais une seule fois par jour.
			const preuve = String(form.get('preuve') ?? '');
			const quota = preuve && verifySolution(preuve) ? QUOTA_AVEC_PREUVE : QUOTA_SANS_PREUVE;
			if (!rateLimit(`drawing:submit:${locals.ipHash}`, quota, JOUR).ok) {
				return echec(429, 'Vous avez déjà envoyé plusieurs propositions. Réessayez demain.', valeurs);
			}
			if (!rateLimit('drawing:global', QUOTA_DU_SITE, JOUR).ok) {
				return echec(429, 'Les propositions sont temporairement suspendues. Réessayez demain.', valeurs);
			}

			await creerProposition({ ...champs, published: 0 }, fichier);
			return reussite;
		} catch (erreur) {
			return echec(400, (erreur as Error).message, valeurs);
		}
	}
};
