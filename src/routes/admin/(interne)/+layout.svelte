<script lang="ts">
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	type Lien = { href: string; label: string; badge?: number };
	type Categorie = { titre: string; href: string; liens: Lien[]; badge?: number };

	/**
	 * La navigation de l'administration, sur deux niveaux : les grandes
	 * catégories en haut, et à gauche seulement les pages de la catégorie
	 * ouverte. Le menu était une seule colonne de quinze entrées, dans l'ordre
	 * où elles avaient été ajoutées ; on n'y retrouvait plus rien
	 * (novembre 2026).
	 *
	 * Ce qui revient le plus souvent - écrire, annoncer un apéro, ranger la une -
	 * est dans « Publier ». « À relire » porte le nombre d'envois de visiteurs
	 * en attente, pour qu'on le voie depuis n'importe quelle page.
	 */
	const aRelire = $derived(data.commentairesEnAttente + data.sourcesEnAttente + data.dessinsEnAttente);
	const categories: Categorie[] = $derived([
		{
			titre: 'Publier',
			href: '/admin/publications',
			liens: [
				{ href: '/admin/publications', label: 'Toutes les publications' },
				{ href: '/admin/publications?type=article', label: 'Articles' },
				{ href: '/admin/publications?type=apero', label: 'Apéros' },
				{ href: '/admin/publications?type=actu', label: 'Événements et formations' },
				{ href: '/admin/a-la-une', label: 'À la une' },
				{ href: '/admin/series', label: 'Séries' }
			]
		},
		{
			titre: 'À relire',
			href: '/admin/commentaires',
			badge: aRelire,
			liens: [
				{ href: '/admin/commentaires', label: 'Commentaires', badge: data.commentairesEnAttente },
				{ href: '/admin/sources', label: 'Sources des apéros', badge: data.sourcesEnAttente },
				{ href: '/admin/dessins', label: 'Dessins', badge: data.dessinsEnAttente }
			]
		},
		{
			titre: 'Le site',
			href: '/admin/reglages',
			liens: [
				{ href: '/admin/reglages', label: 'Réglages' },
				{ href: '/admin/medias-recommandes', label: 'Médias recommandés' },
				{ href: '/admin/medias', label: 'Images' },
				{ href: '/admin/frequentation', label: 'Fréquentation' }
			]
		},
		{
			titre: 'L’équipe',
			href: '/admin/mon-compte',
			liens: [
				{ href: '/admin/mon-compte', label: 'Mon compte' },
				...(data.adminCourant.role === 'owner' ? [{ href: '/admin/comptes', label: 'Comptes' }] : [])
			]
		}
	]);

	/**
	 * Une page appartient à un lien si son adresse commence par celle du lien.
	 * Les liens qui portent un filtre (`?type=apero`) ne s'allument que sur la
	 * liste filtrée de la même façon ; « Toutes les publications » s'allume sur
	 * la liste sans filtre, et sur la fiche d'une publication.
	 */
	function actif(lien: Lien): boolean {
		const cible = new URL(lien.href, page.url.origin);
		const dedans = page.url.pathname === cible.pathname || page.url.pathname.startsWith(`${cible.pathname}/`);
		if (!dedans) return false;
		const filtre = cible.searchParams.get('type');
		const filtreOuvert = page.url.pathname === cible.pathname ? page.url.searchParams.get('type') : null;
		return filtre === filtreOuvert;
	}

	/** La catégorie ouverte : celle dont une page est affichée, aucune sur l'accueil. */
	const ouverte = $derived(
		categories.find((categorie) =>
			categorie.liens.some((lien) => {
				const chemin = new URL(lien.href, page.url.origin).pathname;
				return page.url.pathname === chemin || page.url.pathname.startsWith(`${chemin}/`);
			})
		) ??
			// La page d'activation de la double authentification fait partie du compte.
			(page.url.pathname.startsWith('/admin/double-authentification') ? categories[3] : null)
	);
	const surAccueil = $derived(page.url.pathname === '/admin');
</script>

<!-- Les grandes catégories. Elles défilent au doigt sur téléphone plutôt que
     de passer sur deux lignes. -->
<nav aria-label="Administration" class="-mx-4 mb-6 overflow-x-auto border-b border-line px-4">
	<ul class="flex gap-1">
		<li>
			<a
				href="/admin"
				aria-current={surAccueil ? 'page' : undefined}
				class="block border-b-2 px-3 py-2.5 text-sm font-bold whitespace-nowrap
					{surAccueil ? 'border-brand text-brand' : 'border-transparent text-ink-soft hover:text-ink'}"
				>Accueil</a
			>
		</li>
		{#each categories as categorie (categorie.titre)}
			{@const estOuverte = ouverte?.titre === categorie.titre}
			<li>
				<a
					href={categorie.href}
					aria-current={estOuverte ? 'true' : undefined}
					class="flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-bold whitespace-nowrap
						{estOuverte ? 'border-brand text-brand' : 'border-transparent text-ink-soft hover:text-ink'}"
				>
					{categorie.titre}
					{#if categorie.badge}
						<span class="rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-sur-brand">{categorie.badge}</span>
					{/if}
				</a>
			</li>
		{/each}
	</ul>
</nav>

{#if ouverte}
	<!-- À gauche, les pages de la catégorie ouverte ; au-dessus du contenu, en
	     pastilles, sur les écrans étroits. -->
	<div class="grid gap-6 lg:grid-cols-[12rem_1fr] lg:gap-8">
		<nav aria-label={ouverte.titre}>
			<ul class="flex flex-wrap gap-1 lg:block lg:space-y-1">
				{#each ouverte.liens as lien (lien.href)}
					<li>
						<a
							href={lien.href}
							aria-current={actif(lien) ? 'page' : undefined}
							class="flex items-center justify-between gap-2 rounded px-3 py-2 text-sm font-semibold
								{actif(lien) ? 'bg-brand-soft text-brand' : 'text-ink-soft hover:bg-surface-alt hover:text-ink'}"
						>
							{lien.label}
							{#if lien.badge}
								<span class="rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-sur-brand">{lien.badge}</span>
							{/if}
						</a>
					</li>
				{/each}
			</ul>
		</nav>
		<div class="min-w-0">
			{@render children()}
		</div>
	</div>
{:else}
	{@render children()}
{/if}
