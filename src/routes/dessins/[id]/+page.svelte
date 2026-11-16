<script lang="ts">
	import { page } from '$app/state';
	import Metadonnees from '$lib/components/Metadonnees.svelte';
	import VisionneuseDessin from '$lib/components/VisionneuseDessin.svelte';
	import Partage from '$lib/components/Partage.svelte';
	import { filAriane } from '$lib/donnees-structurees';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	const dessin = $derived(data.dessin);
</script>

<Metadonnees
	titre="{dessin.title} - {data.settings.siteName}"
	description={dessin.caption || `Dessin de ${dessin.author} : ${dessin.title}`}
	image={dessin.image}
	canonique="/dessins/{dessin.id}"
	donnees={filAriane(page.url.origin, [
		{ nom: 'Accueil', chemin: '/' },
		{ nom: 'Dessins et caricatures', chemin: '/dessins' },
		{ nom: dessin.title, chemin: `/dessins/${dessin.id}` }
	])}
/>
<a class="text-sm font-semibold text-brand hover:underline" href="/dessins">← Tous les dessins</a>
<article class="mt-6">
	<header class="border-b border-line pb-4">
		<h1 class="titre-affiche text-3xl text-ink sm:text-4xl">{dessin.title}</h1>
		<p class="mt-3 text-ink-soft">Dessin de {dessin.author}</p>
	</header>
	{#if dessin.image}
		<figure class="mt-6">
			<VisionneuseDessin
				image={dessin.image}
				alt={dessin.alt}
				title={dessin.title}
				previous={data.precedent}
				next={data.suivant}
			/>
			<figcaption class="mt-3 whitespace-pre-line text-ink-soft">{dessin.caption}</figcaption>
		</figure>
		<a class="bouton-secondaire mt-5" href={dessin.image} download>Télécharger l’image originale</a>
	{/if}
	<p class="mt-5 whitespace-pre-line text-sm text-ink-soft">{dessin.rights}</p>
	<nav
		class="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5"
		aria-label="Parcourir les dessins"
	>
		{#if data.precedent}<a
				class="bouton-secondaire"
				href="/dessins/{data.precedent.id}"
				aria-label="Dessin précédent : {data.precedent.title}">← Précédent</a
			>{:else}<span></span>{/if}
		{#if data.suivant}<a
				class="bouton-secondaire"
				href="/dessins/{data.suivant.id}"
				aria-label="Dessin suivant : {data.suivant.title}">Suivant →</a
			>{/if}
	</nav>
	<Partage titre={dessin.title} adresse={`${page.url.origin}/dessins/${dessin.id}`} />
</article>
