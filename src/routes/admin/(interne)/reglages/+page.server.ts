import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { DEFAULTS, getSettings, setSetting, type SettingKey } from '$lib/server/settings';
import { audit } from '$lib/server/auth';

export const load: PageServerLoad = async ({ url }) => ({
	reglages: getSettings(),
	enregistre: url.searchParams.has('enregistre')
});

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const admin = locals.admin!;
		const form = await request.formData();

		const valeurs: Partial<Record<SettingKey, string>> = {
			site_name: String(form.get('site_name') ?? '').trim(),
			site_tagline: String(form.get('site_tagline') ?? '').trim(),
			site_description: String(form.get('site_description') ?? '').trim(),
			contact_email: String(form.get('contact_email') ?? '').trim(),
			comments_mode: form.get('comments_mode') === 'post' ? 'post' : 'pre',
			comments_enabled: form.get('comments_enabled') === '1' ? '1' : '0',
			apero_rythme: String(form.get('apero_rythme') ?? '').trim().slice(0, 80),
			apero_heure: String(form.get('apero_heure') ?? '').trim().slice(0, 20),
			apero_lieu: String(form.get('apero_lieu') ?? '').trim().slice(0, 120),
			apero_adresse: String(form.get('apero_adresse') ?? '').trim().slice(0, 200),
			apero_presentation: String(form.get('apero_presentation') ?? '').trim().slice(0, 1000)
		};

		for (const [cle, valeur] of Object.entries(valeurs)) {
			if (cle in DEFAULTS) setSetting(cle as SettingKey, valeur ?? '');
		}

		audit(admin, 'reglages.modification', '', `commentaires: ${valeurs.comments_mode}`, locals.ipHash);
		redirect(303, '/admin/reglages?enregistre=1');
	}
};
