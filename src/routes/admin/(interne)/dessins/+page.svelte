<script lang="ts">
	import FormulaireDessin from '$lib/components/FormulaireDessin.svelte';
	import type { PageData, ActionData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>Dessins · Administration</title></svelte:head>
<header class="border-b border-line pb-4">
	<h1 class="titre-affiche text-3xl text-ink">Dessins et caricatures</h1>
	<p class="mt-3 text-ink-soft">
		Vérifiez les propositions reçues, puis publiez les dessins acceptés avec leur signature.
	</p>
	<a class="mt-3 inline-block font-semibold text-brand hover:underline" href="/dessins">Voir la galerie →</a>
</header>
{#if form?.erreur}<p role="alert" class="mt-5 rounded-xl border border-red-300 bg-red-50 p-4 text-red-900">
		{form.erreur}
	</p>{/if}
<section class="mt-6" aria-labelledby="propositions-titre">
	<h2 id="propositions-titre" class="text-xl font-bold text-ink">
		Propositions à vérifier ({data.propositions.length})
	</h2>
	{#if !data.propositions.length}<p class="mt-3 text-ink-soft">Aucune proposition en attente.</p>{/if}
	{#each data.propositions as proposition (proposition.id)}
		<details class="carte mt-5">
			<summary class="cursor-pointer font-semibold text-ink">{proposition.title} · {proposition.author}</summary>
			<a href={proposition.image} target="_blank" rel="noopener noreferrer"
				><img class="mt-5 max-h-96 w-full object-contain" src={proposition.image} alt={proposition.alt} /></a
			>
			<form method="POST" action="?/accepter" class="mt-5 space-y-4">
				<input type="hidden" name="submissionId" value={proposition.id} />
				<div>
					<label class="etiquette" for="proposition-{proposition.id}-title">Titre</label><input
						class="champ"
						id="proposition-{proposition.id}-title"
						name="title"
						value={proposition.title}
						required
						maxlength="180"
					/>
				</div>
				<div>
					<label class="etiquette" for="proposition-{proposition.id}-author">Auteur ou pseudonyme</label><input
						class="champ"
						id="proposition-{proposition.id}-author"
						name="author"
						value={proposition.author}
						required
						maxlength="120"
					/>
				</div>
				<div>
					<label class="etiquette" for="proposition-{proposition.id}-alt">Description accessible</label><textarea
						class="champ"
						id="proposition-{proposition.id}-alt"
						name="alt"
						required
						maxlength="300"
						rows="3">{proposition.alt}</textarea
					>
				</div>
				<div>
					<label class="etiquette" for="proposition-{proposition.id}-caption">Légende</label><textarea
						class="champ"
						id="proposition-{proposition.id}-caption"
						name="caption"
						maxlength="2000"
						rows="3">{proposition.caption}</textarea
					>
				</div>
				<div>
					<label class="etiquette" for="proposition-{proposition.id}-rights"
						>Conditions de partage indiquées par l’auteur</label
					><textarea
						class="champ"
						id="proposition-{proposition.id}-rights"
						name="rights"
						required
						maxlength="500"
						rows="2">{proposition.rights}</textarea
					>
				</div>
				<p class="text-sm text-ink-soft">
					L’expéditeur a confirmé disposer de l’autorisation de publication. Vérifiez le dessin et ses conditions avant
					de l’accepter.
				</p>
				<button class="bouton" type="submit">Accepter et publier</button>
			</form>
			<details class="mt-5 border-t border-line pt-5">
				<summary class="cursor-pointer text-sm text-ink-soft">Refuser cette proposition…</summary>
				<form method="POST" action="?/refuser" class="mt-3">
					<input type="hidden" name="submissionId" value={proposition.id} />
					<p class="mb-3 text-sm text-ink-soft">La proposition et son fichier privé seront supprimés.</p>
					<button class="bouton-secondaire" type="submit">Confirmer le refus</button>
				</form>
			</details>
		</details>
	{/each}
</section>
<details class="carte mt-6" open={!data.dessins.length}>
	<summary class="cursor-pointer text-lg font-bold text-ink">Ajouter un dessin</summary>
	<div class="mt-5"><FormulaireDessin /></div>
</details>
<section class="mt-8" aria-label="Dessins enregistrés">
	{#each data.dessins as dessin (dessin.id)}
		<details class="mt-5 rounded-xl border border-line bg-carte p-5">
			<summary class="cursor-pointer font-semibold text-ink"
				>{dessin.title} · {dessin.published ? 'Publié' : 'Brouillon'}</summary
			>
			{#if dessin.image}<img class="mt-5 max-h-64 w-full object-contain" src={dessin.image} alt={dessin.alt} />{/if}
			{#if dessin.published}<a
					class="mt-3 inline-block text-sm font-semibold text-brand hover:underline"
					href="/dessins/{dessin.id}">Voir la page publique →</a
				>{/if}
			<div class="mt-5"><FormulaireDessin {dessin} /></div>
			<details class="mt-5 border-t border-line pt-5">
				<summary class="cursor-pointer text-sm text-ink-soft">Supprimer ce dessin…</summary>
				<form method="POST" action="?/supprimer" class="mt-3">
					<input type="hidden" name="id" value={dessin.id} />
					<p class="mb-3 text-sm text-ink-soft">
						La fiche sera supprimée. L’image restera disponible dans la médiathèque.
					</p>
					<button class="bouton-secondaire" type="submit">Confirmer la suppression</button>
				</form>
			</details>
		</details>
	{/each}
</section>
