<script lang="ts">
	import { page } from '$app/state';
	import Metadonnees from '$lib/components/Metadonnees.svelte';
	import { filAriane } from '$lib/donnees-structurees';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();

	const etapes = [
		{
			titre: 'Venez à un apéro',
			texte:
				"Un lundi sur deux, on se retrouve dans un bar autour d'un thème choisi à l'avance. C'est le plus simple pour faire connaissance, sans rien avoir préparé.",
			lien: { href: '/aperos', label: 'Le prochain apéro' }
		},
		{
			titre: 'Passez à une réunion',
			texte:
				"On s'y retrouve pour écrire les articles et préparer les apéros. Elles ne sont pas annoncées sur le site : demandez l'heure et le lieu lors d'un apéro. Une première fois, on peut simplement écouter et poser ses questions.",
			lien: { href: '/le-groupe', label: 'Qui sommes-nous ?' }
		},
		{
			titre: 'Participez à votre rythme',
			texte:
				"Tractage, porte-à-porte, écriture d'un article, organisation d'un apéro ou logistique : chacun contribue selon ses envies et son temps.",
			lien: null
		}
	];
</script>

<Metadonnees
	titre="Nous rejoindre - {data.settings.siteName}"
	description="Rejoindre La chouette rouge, collectif militant du centre de Dijon : gratuit, sans inscription, aucune expérience nécessaire."
	donnees={filAriane(page.url.origin, [
		{ nom: 'Accueil', chemin: '/' },
		{ nom: 'Nous rejoindre', chemin: '/nous-rejoindre' }
	])}
/>

<header class="border-b border-line pb-4">
	<p class="text-xs font-bold tracking-[0.2em] text-brand uppercase">Dijon Centre</p>
	<h1 class="titre-affiche mt-2 text-3xl text-ink sm:text-4xl">Nous rejoindre</h1>
	<p class="mt-3 max-w-2xl text-lg text-ink-soft">
		Aucune expérience militante n'est nécessaire, aucune cotisation n'est demandée. Venez comme
		vous êtes.
	</p>
</header>

<ol class="mt-5 grid gap-4 sm:grid-cols-3">
	{#each etapes as etape, i (etape.titre)}
		<li class="flex flex-col rounded-2xl border border-line bg-carte p-6">
			<span
				class="grid h-9 w-9 place-items-center rounded-full bg-brand text-sm font-extrabold text-sur-brand"
				aria-hidden="true">{i + 1}</span
			>
			<h2 class="mt-4 text-lg font-extrabold tracking-tight text-ink">{etape.titre}</h2>
			<p class="mt-2 grow text-sm leading-relaxed text-ink-soft">{etape.texte}</p>
			{#if etape.lien}
				<a href={etape.lien.href} class="mt-4 text-sm font-semibold text-brand hover:underline"
					>{etape.lien.label} →</a
				>
			{/if}
		</li>
	{/each}
</ol>

<div class="contenu mt-8 max-w-2xl">
	<h2>Ce que ça implique - et ce que ça n'implique pas</h2>
	<p>
		Militer avec La chouette rouge, c'est venir quand on peut. Certains membres sont là chaque semaine,
		d'autres une fois par mois, d'autres seulement pour les grandes mobilisations. Il n'y a ni
		présence obligatoire, ni tâche imposée, ni compte à rendre.
	</p>
	<p>
		La chouette rouge est un collectif indépendant : le rejoindre n'engage à s'inscrire nulle part, ni à
		adhérer à un parti.
	</p>
</div>
