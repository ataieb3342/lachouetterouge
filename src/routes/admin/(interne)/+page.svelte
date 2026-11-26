<script lang="ts">
	import { compte, formatDateLongue, formatRelative } from '$lib/format';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/**
	 * Ce qui attend quelqu'un, en une liste : relire ce que les visiteurs ont
	 * envoyé, finir les brouillons. Une ligne n'apparaît que s'il y a quelque
	 * chose à faire ; sinon, la liste le dit.
	 */
	const aFaire = $derived(
		[
			{ n: data.commentairesEnAttente, texte: compte(data.commentairesEnAttente, 'commentaire à relire', 'commentaires à relire'), href: '/admin/commentaires' },
			{ n: data.sourcesEnAttente, texte: compte(data.sourcesEnAttente, 'source d’apéro à relire', 'sources d’apéro à relire'), href: '/admin/sources' },
			{ n: data.dessinsEnAttente, texte: compte(data.dessinsEnAttente, 'dessin proposé', 'dessins proposés'), href: '/admin/dessins' },
			{ n: data.brouillons, texte: compte(data.brouillons, 'brouillon', 'brouillons'), href: '/admin/publications?etat=draft' }
		].filter((ligne) => ligne.n > 0)
	);
</script>

<svelte:head><title>Tableau de bord - Administration</title></svelte:head>

<header class="flex flex-wrap items-center justify-between gap-4">
	<div>
		<h1 class="text-2xl font-extrabold text-ink">Bonjour {data.adminCourant.displayName}</h1>
		<p class="mt-1 text-sm text-ink-soft">Ce qui attend, puis l’état du site.</p>
	</div>
	<a class="bouton" href="/admin/publications/nouvelle">Nouvelle publication</a>
</header>

{#if data.picRecent}
	<a
		href="/admin/frequentation"
		class="mt-6 block hover:underline {data.picRecent.attaque ? 'alerte' : 'alerte alerte-succes'}"
	>
		{data.picRecent.attaque ? 'Attaque probable' : 'Forte affluence'}
		{formatRelative(`${data.picRecent.debut}Z`)} : {compte(data.picRecent.requetes, 'requête')}, dont
		{compte(data.picRecent.bloquees, 'bloquée')}. Voir la fréquentation.
	</a>
{/if}

<section class="mt-6" aria-labelledby="a-faire">
	<h2 id="a-faire" class="mb-3 text-lg font-extrabold text-ink">À faire</h2>
	<ul class="divide-y divide-line rounded-lg border border-line bg-carte text-sm">
		{#each aFaire as ligne (ligne.href)}
			<li>
				<a class="flex items-center justify-between px-4 py-3 font-semibold text-ink hover:text-brand" href={ligne.href}>
					{ligne.texte}
					<span class="text-brand" aria-hidden="true">→</span>
				</a>
			</li>
		{/each}
		<li class="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
			{#if data.prochainApero}
				<span class="text-ink-soft">
					Prochain apéro : <strong class="text-ink">{data.prochainApero.titre}</strong>,
					{formatDateLongue(data.prochainApero.date)}
				</span>
				<a class="font-semibold text-brand hover:underline" href="/admin/publications/{data.prochainApero.id}">Modifier</a>
			{:else}
				<span class="font-semibold text-ink">Aucun apéro annoncé : l’accueil n’a pas de prochain rendez-vous.</span>
				<a class="font-semibold text-brand hover:underline" href="/admin/publications/nouvelle">Annoncer le prochain →</a>
			{/if}
		</li>
	</ul>
	{#if !aFaire.length}
		<p class="mt-2 text-sm text-ink-faint">Rien d’autre en attente.</p>
	{/if}
</section>

<a href="/admin/frequentation" class="carte mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-2 hover:border-brand">
	<span>
		<strong class="text-2xl font-extrabold text-ink">{data.frequentation.aujourdhui.toLocaleString('fr-FR')}</strong>
		<span class="text-xs text-ink-faint">{data.frequentation.aujourdhui > 1 ? 'visiteurs' : 'visiteur'} aujourd’hui</span>
	</span>
	<span>
		<strong class="text-2xl font-extrabold text-ink">{data.frequentation.semaine.toLocaleString('fr-FR')}</strong>
		<span class="text-xs text-ink-faint">{data.frequentation.semaine > 1 ? 'visites' : 'visite'} sur 7 jours</span>
	</span>
	<span class="ml-auto text-sm font-semibold text-brand">Fréquentation et surveillance →</span>
</a>

<section class="mt-8">
	<h2 class="mb-3 text-lg font-extrabold text-ink">Journal d'activité</h2>
	<p class="mb-3 text-sm text-ink-soft">
		Les actions sensibles sont tracées. En cas de doute sur un compte, c'est ici qu'on regarde.
	</p>
	<ul class="divide-y divide-line rounded-lg border border-line text-sm">
		{#each data.journal as ligne (ligne.id)}
			<li class="flex flex-wrap gap-x-3 px-4 py-2">
				<span class="font-mono text-xs text-ink-faint">{formatRelative(ligne.created_at)}</span>
				<span class="font-semibold text-ink">{ligne.admin_name}</span>
				<span class="text-ink-soft">{ligne.action}</span>
				{#if ligne.target}<span class="text-ink-faint">{ligne.target}</span>{/if}
			</li>
		{:else}
			<li class="px-4 py-3 text-ink-soft">Aucune activité enregistrée.</li>
		{/each}
	</ul>
</section>
