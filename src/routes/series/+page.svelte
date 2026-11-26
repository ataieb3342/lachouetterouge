<script lang="ts">
	import { page } from '$app/state';
	import Metadonnees from '$lib/components/Metadonnees.svelte';
	import { filAriane } from '$lib/donnees-structurees';
	import { COULEUR_KIND } from '$lib/format';
	import type { PageData } from './$types';

	/**
	 * Les séries : des articles qui suivent un même fil, thème par thème, avec
	 * une structure commune (décidé en réunion le 25 novembre 2026). Chaque
	 * série a sa page ; celle-ci ne fait que les présenter. On y arrive depuis
	 * la page Articles, dont elle fait partie (le lien « Articles » de
	 * l'en-tête s'y allume).
	 */
	let { data }: { data: PageData } = $props();

	const chapo = 'Des articles qui suivent un même fil, thème par thème, construits de la même façon : à lire dans l’ordre, ou au choix.';
</script>

<Metadonnees
	titre="Nos séries - {data.settings.siteName}"
	description={chapo}
	canonique="/series"
	donnees={filAriane(page.url.origin, [
		{ nom: 'Accueil', chemin: '/' },
		{ nom: 'Articles', chemin: '/articles' },
		{ nom: 'Séries', chemin: '/series' }
	])}
/>

<p class="text-sm">
	<a class="font-semibold text-brand hover:underline" href="/articles">← Tous les articles</a>
</p>

<header class="mt-5 border-b border-line pb-4">
	<p class="text-xs font-bold tracking-[0.2em] uppercase {COULEUR_KIND.article}">Articles</p>
	<h1 class="titre-affiche mt-2 text-3xl text-ink sm:text-4xl">Nos séries</h1>
	<p class="mt-3 max-w-2xl text-lg text-ink-soft">{chapo}</p>
</header>

{#if data.series.length}
	<ul class="mt-6 grid gap-4 sm:grid-cols-2">
		{#each data.series as serie (serie.slug)}
			<!-- Toute la carte est cliquable : le lien du titre est étendu par `::after`. -->
			<li class="group relative rounded-xl border border-line bg-carte p-5 transition hover:border-brand">
				<p class="text-xs font-bold tracking-wide text-ink-faint uppercase">
					{serie.articles} article{serie.articles > 1 ? 's' : ''}
				</p>
				<h2 class="titre-affiche mt-1 text-xl text-ink">
					<a href="/series/{serie.slug}" class="after:absolute after:inset-0 group-hover:text-brand">{serie.titre}</a>
				</h2>
				{#if serie.presentation}
					<p class="mt-2 line-clamp-3 text-sm text-ink-soft">{serie.presentation}</p>
				{/if}
			</li>
		{/each}
	</ul>
{:else}
	<p class="mt-6 text-ink-soft">Aucune série pour le moment.</p>
{/if}
