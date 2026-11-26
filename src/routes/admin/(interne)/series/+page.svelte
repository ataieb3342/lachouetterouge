<script lang="ts">
	import type { ActionData, PageData } from './$types';

	/**
	 * Les séries d'articles : on les crée ici, puis chaque article choisit la
	 * sienne dans son formulaire (format « Série »). Voir `series.ts`.
	 */
	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Une erreur sur la modification d'une série rouvre son formulaire.
	const idEnErreur = $derived(form && 'id' in form ? form.id : null);
</script>

<svelte:head><title>Séries - Administration</title></svelte:head>

<h1 class="text-2xl font-extrabold text-ink">Séries</h1>
<p class="mt-1 text-sm text-ink-soft">
	Une série, ce sont plusieurs articles qui suivent le même fil, thème par thème, avec la même structure.
	Créez-la ici, puis, dans chaque article, choisissez le format « Série » et cette série. Chacune a sa page
	publique, reliée depuis la page <a class="font-semibold text-brand hover:underline" href="/articles">Articles</a>.
</p>

{#if form?.erreur && idEnErreur === null}<p role="alert" class="alerte mt-4">{form.erreur}</p>{/if}

{#if data.series.length}
	<ul class="mt-6 space-y-3">
		{#each data.series as serie, i (serie.id)}
			<li class="carte">
				<p class="font-bold text-ink">
					{serie.titre}
					<span class="ml-1 text-xs font-normal text-ink-faint">
						{serie.articles} article{serie.articles > 1 ? 's' : ''}{serie.articles
							? ` · ${serie.enLigne} en ligne`
							: ''}
					</span>
				</p>
				{#if serie.presentation}<p class="mt-1 text-sm text-ink-soft">{serie.presentation}</p>{/if}
				<p class="mt-1 text-xs text-ink-faint">
					<a class="font-semibold text-brand hover:underline" href="/series/{serie.slug}" target="_blank">/series/{serie.slug} ↗</a>
				</p>

				<div class="mt-3 flex flex-wrap items-center gap-2">
					<form method="POST" action="?/deplacer" class="flex gap-1">
						<input type="hidden" name="id" value={serie.id} />
						<button class="bouton-secondaire" type="submit" name="sens" value="haut" disabled={i === 0} aria-label="Monter {serie.titre}">↑</button>
						<button
							class="bouton-secondaire"
							type="submit"
							name="sens"
							value="bas"
							disabled={i === data.series.length - 1}
							aria-label="Descendre {serie.titre}">↓</button
						>
					</form>
					<!-- Une série qui contient des articles ne se supprime pas : le
					     serveur le refuserait, autant ne pas proposer le bouton. -->
					{#if serie.articles === 0}
						<form method="POST" action="?/supprimer" class="ml-auto">
							<input type="hidden" name="id" value={serie.id} />
							<button class="bouton-danger" type="submit">Supprimer</button>
						</form>
					{/if}
				</div>

				<details class="mt-3" open={idEnErreur === serie.id}>
					<summary class="cursor-pointer text-sm font-semibold text-brand">Modifier</summary>
					<form method="POST" action="?/modifier" class="mt-3 space-y-3">
						{#if idEnErreur === serie.id}<p role="alert" class="alerte">{form?.erreur}</p>{/if}
						<input type="hidden" name="id" value={serie.id} />
						{@render champs(serie, `s${serie.id}`)}
						<p class="aide">L’adresse de la page ne change pas avec le titre : elle a peut-être déjà été partagée.</p>
						<button class="bouton" type="submit">Enregistrer</button>
					</form>
				</details>
			</li>
		{/each}
	</ul>
{:else}
	<p class="carte mt-6 text-sm text-ink-soft">Aucune série pour le moment.</p>
{/if}

<h2 class="mt-8 text-lg font-extrabold text-ink">Nouvelle série</h2>
<form method="POST" action="?/ajouter" class="carte mt-3 space-y-3">
	{@render champs(null, 'nouvelle')}
	<button class="bouton" type="submit">Créer la série</button>
</form>

{#snippet champs(serie: PageData['series'][number] | null, prefixe: string)}
	<div>
		<label class="etiquette" for="{prefixe}-titre">Titre</label>
		<input id="{prefixe}-titre" name="titre" class="champ" required maxlength="120" value={serie?.titre ?? ''} placeholder="Ce que propose le programme, thème par thème" />
	</div>
	<div>
		<label class="etiquette" for="{prefixe}-presentation">Présentation</label>
		<textarea id="{prefixe}-presentation" name="presentation" class="champ" rows="3" maxlength="600">{serie?.presentation ?? ''}</textarea>
		<p class="aide">Deux ou trois phrases en tête de la page de la série : le fil conducteur, et comment les articles sont construits.</p>
	</div>
{/snippet}
