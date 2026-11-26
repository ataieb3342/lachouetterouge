<script lang="ts">
	import { page } from '$app/state';
	import CarteArticle from '$lib/components/CarteArticle.svelte';
	import Metadonnees from '$lib/components/Metadonnees.svelte';
	import { filAriane } from '$lib/donnees-structurees';
	import { COULEUR_KIND } from '$lib/format';
	import { CHAPO_RUBRIQUE, SURLIGNE_RUBRIQUE, TITRE_RUBRIQUE } from '$lib/rubriques';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const titre = TITRE_RUBRIQUE.articles;
	const chapo = CHAPO_RUBRIQUE.articles;

	// La première page s'ouvre sur le plus récent en grand ; les suivantes
	// sont une grille simple.
	const enTete = $derived(data.page === 1 ? (data.publications[0] ?? null) : null);
	const grille = $derived(enTete ? data.publications.slice(1) : data.publications);

	/**
	 * Les trois formats décidés en réunion le 25 novembre 2026, en pastilles.
	 * Ce sont des liens : le filtre marche sans JavaScript et se partage.
	 */
	const FILTRES = [
		{ valeur: null, libelle: 'Tout' },
		{ valeur: 'actu', libelle: 'Actus' },
		{ valeur: 'article', libelle: 'Articles' },
		{ valeur: 'serie', libelle: 'Séries' }
	] as const;

	// Chaque page de la liste est une page à part entière : elle se désigne
	// elle-même comme canonique et porte son numéro dans le titre. Les renvoyer
	// toutes vers la page 1 ferait disparaître de l'index les publications
	// anciennes, qui ne sont listées nulle part ailleurs.
	function lienListe(numero: number, format: string | null = data.format): string {
		const parametres = new URLSearchParams();
		if (format) parametres.set('format', format);
		if (numero > 1) parametres.set('page', String(numero));
		const suite = parametres.toString();
		return `/articles${suite ? `?${suite}` : ''}`;
	}
	const chemin = $derived(lienListe(data.page));
	const filtre = $derived(FILTRES.find((f) => f.valeur === data.format) ?? FILTRES[0]);
	const suffixe = $derived(
		(data.format ? ` · ${filtre.libelle}` : '') + (data.page > 1 ? ` (page ${data.page})` : '')
	);
</script>

<Metadonnees
	titre="{titre}{suffixe} - {data.settings.siteName}"
	description={chapo}
	canonique={chemin}
	indexable={!data.format}
	donnees={filAriane(page.url.origin, [
		{ nom: 'Accueil', chemin: '/' },
		{ nom: titre, chemin: '/articles' }
	])}
/>

<!-- Pas d'encart coloré en tête : un pavé violet avant le premier article se
     lisait comme une publicité et repoussait la liste. Les séries et la
     bibliothèque sont annoncées d'une ligne chacune. Les vues filtrées portent
     `noindex, follow`, comme les résultats de recherche : elles ne contiennent
     rien que la liste complète n'ait déjà. -->
<header class="border-b border-line pb-4">
	<p class="text-xs font-bold tracking-[0.2em] uppercase {COULEUR_KIND.article}">{SURLIGNE_RUBRIQUE.articles}</p>
	<h1 class="titre-affiche mt-2 text-3xl text-ink sm:text-4xl">
		{titre}{#if data.page > 1}<span class="text-ink-faint"> · page {data.page}</span>{/if}
	</h1>
	<p class="mt-3 max-w-2xl text-lg text-ink-soft">{chapo}</p>
	{#if data.series.length}
		<p class="mt-3 text-sm text-ink-soft">
			<a class="font-semibold text-brand hover:underline" href="/series">Nos séries</a> :
			{#each data.series as serie, i (serie.slug)}{i > 0 ? ', ' : ''}<a
					class="font-semibold text-ink hover:text-brand hover:underline"
					href="/series/{serie.slug}">{serie.titre}</a
				>{/each}
		</p>
	{/if}
	<p class="mt-3 text-sm">
		<a class="font-semibold text-brand hover:underline" href="/bibliotheque"
			>Les lectures partagées autour de nos apéros sont dans la bibliothèque →</a
		>
	</p>
</header>

<nav class="mt-5" aria-label="Filtrer par format">
	<ul class="flex flex-wrap gap-2">
		{#each FILTRES as f (f.libelle)}
			{@const actif = data.format === f.valeur}
			<li>
				<a
					href={lienListe(1, f.valeur)}
					aria-current={actif ? 'page' : undefined}
					class="inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors
						{actif ? 'border-brand bg-brand text-sur-brand' : 'border-line-forte bg-carte text-ink-soft hover:text-ink'}"
					>{f.libelle}</a
				>
			</li>
		{/each}
	</ul>
</nav>

{#if data.publications.length}
	{#if enTete}
		<div class="mt-6 border-b border-line pb-6">
			<CarteArticle publication={enTete} forme="grande" />
		</div>
	{/if}

	{#if grille.length}
		<div class="mt-6 grid gap-5 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-8 lg:grid-cols-3">
			{#each grille as publication (publication.id)}
				<CarteArticle {publication} forme="carte" />
			{/each}
		</div>
	{/if}

	{#if data.pages > 1}
		<nav class="mt-8 flex items-center justify-between border-t border-line pt-5" aria-label="Pagination">
			{#if data.page > 1}
				<a class="bouton-secondaire" href={lienListe(data.page - 1)}>← Plus récents</a>
			{:else}
				<span></span>
			{/if}
			<span class="text-sm text-ink-faint">Page {data.page} sur {data.pages}</span>
			{#if data.page < data.pages}
				<a class="bouton-secondaire" href={lienListe(data.page + 1)}>Plus anciens →</a>
			{:else}
				<span></span>
			{/if}
		</nav>
	{/if}
{:else}
	<p class="mt-6 text-ink-soft">
		{data.format ? `Aucun article de ce format pour le moment.` : 'Aucun article pour le moment.'}
	</p>
{/if}
