<script lang="ts">
	import { formatDateTime } from '$lib/format';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Ce qu'on attend de l'auteur à chaque étape de son article.
	const PROCHAIN_PAS = {
		redaction: 'Continuer la rédaction',
		relecture: 'Voir l’article',
		valide: 'Mettre en ligne',
		'en-ligne': 'Voir l’article'
	} as const;
</script>

<svelte:head><title>Relecture - Administration</title></svelte:head>

<header class="flex flex-wrap items-center justify-between gap-4">
	<div>
		<h1 class="text-2xl font-extrabold text-ink">Relecture</h1>
		<p class="mt-1 max-w-2xl text-sm text-ink-soft">
			Un article est mis en ligne après avoir été relu par une deuxième personne : rédaction, relecture,
			validation, mise en ligne.
		</p>
	</div>
	<a class="bouton" href="/admin/publications/nouvelle">Écrire un article</a>
</header>

{#if data.envoye}
	<p class="alerte alerte-succes mt-5">
		Article envoyé en relecture. Vous pouvez encore le corriger en attendant.
	</p>
{/if}

<section class="mt-8" aria-labelledby="a-relire">
	<h2 id="a-relire" class="text-lg font-bold text-ink">À relire ({data.aRelire.length})</h2>
	<p class="aide">Les articles des autres qui attendent une deuxième lecture.</p>
	{#if data.aRelire.length}
		<ul class="mt-3 space-y-3">
			{#each data.aRelire as article (article.id)}
				<li class="carte relative transition hover:border-brand">
					<h3 class="font-bold text-ink">
						<a class="after:absolute after:inset-0" href="/admin/publications/{article.id}">{article.title}</a>
					</h3>
					<p class="mt-1 text-sm text-ink-soft">
						{article.auteurNom || 'Auteur à renseigner'} · modifié {formatDateTime(article.modifieLe)}
					</p>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="mt-3 text-ink-soft">Rien à relire pour le moment.</p>
	{/if}
</section>

<section class="mt-8" aria-labelledby="mes-articles">
	<h2 id="mes-articles" class="text-lg font-bold text-ink">Mes articles en cours ({data.mesArticles.length})</h2>
	<p class="aide">Vos articles qui ne sont pas encore en ligne, et ce qu'il leur manque.</p>
	{#if data.mesArticles.length}
		<ul class="mt-3 space-y-3">
			{#each data.mesArticles as article (article.id)}
				<li class="carte relative transition hover:border-brand">
					<p class="text-xs font-bold tracking-wide text-brand uppercase">
						{article.corrections ? 'Corrections demandées' : article.libelle}
					</p>
					<h3 class="mt-1 font-bold text-ink">
						<a class="after:absolute after:inset-0" href="/admin/publications/{article.id}">{article.title}</a>
					</h3>
					{#if article.corrections}<p class="mt-1 text-sm text-ink-soft">{article.corrections}</p>{/if}
					<p class="mt-2 text-sm font-semibold text-brand">{PROCHAIN_PAS[article.etape]} →</p>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="mt-3 text-ink-soft">Aucun article en cours.</p>
	{/if}
</section>
