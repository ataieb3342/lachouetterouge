<script lang="ts">
	import { page } from '$app/state';
	import Metadonnees from '$lib/components/Metadonnees.svelte';
	import { filAriane } from '$lib/donnees-structurees';
	import { COULEUR_KIND, formatDate, lienPublication } from '$lib/format';
	import type { PageData } from './$types';

	/**
	 * Une série : sa présentation, puis ses articles numérotés dans l'ordre de
	 * lecture. Une liste et non une grille de cartes : l'ordre est ce qui
	 * compte ici, et une grille le brouille.
	 */
	let { data }: { data: PageData } = $props();

	const description = $derived(
		data.serie.presentation || `Une série d’articles : ${data.serie.titre}.`
	);
</script>

<Metadonnees
	titre="{data.serie.titre} - Série - {data.settings.siteName}"
	{description}
	canonique="/series/{data.serie.slug}"
	image={data.articles[0]?.cover?.url ?? null}
	donnees={filAriane(page.url.origin, [
		{ nom: 'Accueil', chemin: '/' },
		{ nom: 'Articles', chemin: '/articles' },
		{ nom: 'Séries', chemin: '/series' },
		{ nom: data.serie.titre, chemin: `/series/${data.serie.slug}` }
	])}
/>

<p class="text-sm">
	<a class="font-semibold text-brand hover:underline" href="/series">← Toutes les séries</a>
</p>

<header class="mt-5 border-b border-line pb-4">
	<p class="text-xs font-bold tracking-[0.2em] uppercase {COULEUR_KIND.article}">
		Série · {data.articles.length} article{data.articles.length > 1 ? 's' : ''}
	</p>
	<h1 class="titre-affiche mt-2 text-3xl text-ink sm:text-4xl">{data.serie.titre}</h1>
	{#if data.serie.presentation}
		<p class="mt-3 max-w-2xl text-lg whitespace-pre-line text-ink-soft">{data.serie.presentation}</p>
	{/if}
</header>

{#if data.articles.length}
	<ol class="mt-6 max-w-3xl space-y-3">
		{#each data.articles as article, i (article.id)}
			<li class="group relative flex gap-4 rounded-xl border border-line bg-carte p-4 transition hover:border-brand">
				<span class="titre-affiche w-8 shrink-0 text-2xl text-brand" aria-hidden="true">{i + 1}</span>
				<div class="min-w-0 flex-1">
					<h2 class="text-lg leading-snug font-bold text-ink">
						<a
							href={lienPublication(article.kind, article.slug)}
							class="after:absolute after:inset-0 group-hover:text-brand group-hover:underline underline-offset-4"
							>{article.title}</a
						>
					</h2>
					{#if article.summary}
						<p class="mt-1 line-clamp-2 text-sm text-ink-soft">{article.summary}</p>
					{/if}
					<p class="mt-1.5 text-xs text-ink-faint">
						<time datetime={article.publishedAt ?? undefined}>{formatDate(article.publishedAt)}</time>
						{#if article.authorName}· {article.authorName}{/if}
					</p>
				</div>
			</li>
		{/each}
	</ol>
{:else}
	<p class="mt-6 text-ink-soft">Les premiers articles de cette série arrivent bientôt.</p>
{/if}
