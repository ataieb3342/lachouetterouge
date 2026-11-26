<script lang="ts">
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	/**
	 * Le menu, en quatre groupes : ce qu'on publie, ce que les visiteurs
	 * proposent et qu'il faut relire, le réglage du site, l'équipe. Il était
	 * une liste de quinze entrées dans l'ordre où elles avaient été ajoutées
	 * (novembre 2026) ; on n'y retrouvait plus rien.
	 */
	const groupes = $derived([
		{
			titre: 'Publier',
			liens: [
				{ href: '/admin/publications', label: 'Publications' },
				{ href: '/admin/a-la-une', label: 'À la une' },
				{ href: '/admin/series', label: 'Séries' }
			]
		},
		{
			titre: 'À relire',
			liens: [
				{ href: '/admin/commentaires', label: 'Commentaires', badge: data.commentairesEnAttente },
				{ href: '/admin/sources', label: 'Sources des apéros', badge: data.sourcesEnAttente },
				{ href: '/admin/dessins', label: 'Dessins', badge: data.dessinsEnAttente }
			]
		},
		{
			titre: 'Le site',
			liens: [
				{ href: '/admin/medias-recommandes', label: 'Médias recommandés' },
				{ href: '/admin/medias', label: 'Images', exact: true },
				{ href: '/admin/frequentation', label: 'Fréquentation' },
				{ href: '/admin/reglages', label: 'Réglages' }
			]
		},
		{
			titre: 'L’équipe',
			liens: [
				...(data.adminCourant.role === 'owner' ? [{ href: '/admin/comptes', label: 'Comptes' }] : []),
				{ href: '/admin/mon-compte', label: 'Mon compte' }
			]
		}
	]);

	function actif(lien: { href: string; exact?: boolean }): boolean {
		return lien.exact ? page.url.pathname === lien.href : page.url.pathname === lien.href || page.url.pathname.startsWith(`${lien.href}/`);
	}
</script>

<div class="grid gap-8 lg:grid-cols-[13rem_1fr]">
	<nav aria-label="Administration" class="space-y-4">
		<a
			href="/admin"
			aria-current={actif({ href: '/admin', exact: true }) ? 'page' : undefined}
			class="block rounded px-3 py-2 text-sm font-semibold
				{actif({ href: '/admin', exact: true }) ? 'bg-brand-soft text-brand' : 'text-ink-soft hover:bg-surface-alt hover:text-ink'}"
			>Tableau de bord</a
		>
		{#each groupes as groupe (groupe.titre)}
			<div>
				<p class="mb-1 px-3 text-xs font-bold tracking-wide text-ink-faint uppercase">{groupe.titre}</p>
				<ul class="flex flex-wrap gap-1 lg:block lg:space-y-1">
					{#each groupe.liens as lien (lien.href)}
						<li>
							<a
								href={lien.href}
								aria-current={actif(lien) ? 'page' : undefined}
								class="flex items-center justify-between gap-2 rounded px-3 py-2 text-sm font-semibold
									{actif(lien) ? 'bg-brand-soft text-brand' : 'text-ink-soft hover:bg-surface-alt hover:text-ink'}"
							>
								{lien.label}
								{#if 'badge' in lien && lien.badge}
									<span class="rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-sur-brand">{lien.badge}</span>
								{/if}
							</a>
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</nav>

	<div class="min-w-0">
		{@render children()}
	</div>
</div>
