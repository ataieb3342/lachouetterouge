<script lang="ts">
	import PanneauRelecture from '$lib/components/PanneauRelecture.svelte';
	import { enhance } from '$app/forms';
	import FormulairePublication from '$lib/components/FormulairePublication.svelte';
	import { formatDateTime, lienPublication } from '$lib/format';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Après une erreur, on réaffiche ce qui venait d'être saisi ; sinon le
	// contenu enregistré en base.
	const valeurs = $derived(form && 'body' in form ? { ...form } : { body: data.corps });

	const FORMULAIRE = 'formulaire-publication';

	// Le bouton qui fait avancer l'article d'une étape. Il n'y en a jamais
	// qu'un : c'est ce qui dit à chacun ce qu'on attend de lui. Il est montré
	// deux fois - en tête de fiche et au pied du formulaire -, avec le même
	// libellé.
	const actionPrincipale = $derived(
		data.droits.peutEnvoyer
			? {
					libelle: 'Enregistrer et envoyer en relecture',
					action: '?/envoyer',
					aide: 'Une autre personne de l’équipe relira le texte avant sa mise en ligne.'
				}
			: data.droits.peutValider
				? {
						libelle: 'Enregistrer et valider',
						action: '?/valider',
						aide: 'Enregistre vos corrections et autorise l’auteur à mettre l’article en ligne.'
					}
				: data.droits.peutPublier
					? {
							libelle: 'Enregistrer et mettre en ligne',
							action: '?/publier',
							aide: 'L’article sera visible de tous sur le site.'
						}
					: null
	);
</script>

<svelte:head><title>{data.publication.title} - Administration</title></svelte:head>

<header class="mb-6 flex flex-wrap items-start justify-between gap-4">
	<div>
		<a class="text-sm font-semibold text-brand hover:underline" href="/admin/publications">← Publications</a>
		<h1 class="mt-1 text-2xl font-extrabold text-ink">{data.droits.peutModifier ? 'Modifier' : 'Consulter'}</h1>
		<p class="mt-1 text-xs text-ink-faint">
			Adresse : <code class="rounded bg-surface-alt px-1"
				>{lienPublication(data.publication.kind, data.publication.slug)}</code
			>
			· Modifié {formatDateTime(data.publication.updatedAt)}
		</p>
	</div>
	<a class="bouton-secondaire" href={lienPublication(data.publication.kind, data.publication.slug)}>
		{data.publication.status === 'draft' ? 'Aperçu' : 'Voir en ligne'}
	</a>
</header>

{#if data.enregistre && !form}
	<!-- Le résultat de « Enregistrer et mettre à la une ». Le texte est
	     toujours enregistré ; seule la une a pu refuser la fiche. -->
	{#if data.une === 'ok'}
		<p class="alerte alerte-succes mb-6">
			Enregistré et mis à la une, {data.positionUne === 1
				? 'en grande fiche'
				: `en ${data.positionUne}ᵉ position`}.
			<a class="font-semibold underline" href="/admin/a-la-une">Ranger la une →</a>
		</p>
	{:else if data.une === 'brouillon'}
		<p class="alerte mb-6">
			Enregistré, mais pas mis à la une : cette publication n'est pas encore en ligne.
		</p>
	{:else if data.une === 'pleine'}
		<p class="alerte mb-6">
			Enregistré, mais pas mis à la une : elle est déjà pleine.
			<a class="font-semibold underline" href="/admin/a-la-une">Retirer une fiche de la une →</a>
		</p>
	{:else}
		<p class="alerte alerte-succes mb-6">Modifications enregistrées.</p>
	{/if}
{/if}


{#if data.droits.etape}
	<PanneauRelecture
		droits={data.droits}
		historique={data.historique}
		formulaire={data.droits.peutModifier ? FORMULAIRE : null}
		{actionPrincipale}
		erreur={data.droits.peutModifier ? '' : (form?.erreur ?? '')}
	/>
{/if}

{#if data.droits.peutModifier}

<form
	id={FORMULAIRE}
	method="POST"
	action="?/enregistrer"
	enctype="multipart/form-data"
	use:enhance={({ action, formData }) => {
		// L'aperçu n'a pas besoin de l'image de couverture : on ne l'envoie pas.
		if (action.search === '?/apercu') {
			formData.delete('cover');
			formData.delete('eventMap');
		}
		return async ({ update }) => {
			// reset: false : les champs gardent ce qu'on vient de taper, et le
			// fichier choisi reste sélectionné.
			await update({ reset: false });
			if (action.search === '?/apercu') document.getElementById('apercu')?.scrollIntoView();
		};
	}}
>
	<!-- La version du texte qu'on a sous les yeux : le serveur refuse
	     d'enregistrer par-dessus une version que quelqu'un d'autre a modifiée. -->
	<input type="hidden" name="revision" value={data.droits.revision} />
	<FormulairePublication
		publication={data.publication}
		{actionPrincipale}
		admins={data.admins}
		series={data.series}
		positionUne={data.positionUne}
		{valeurs}
		erreur={form?.erreur ?? ''}
		apercu={form?.apercu ?? ''}
		libelleValider="Enregistrer"
		actionUne="?/enregistrerEtUne"
	/>

	<label class="mt-4 flex items-start gap-2 text-sm text-ink">
		<input type="checkbox" name="regenererUrl" value="1" class="mt-0.5" />
		<span>
			Régénérer l'adresse à partir du nouveau titre
			<span class="block text-xs text-ink-faint">
				Les liens déjà partagés vers l'ancienne adresse cesseront de fonctionner.
			</span>
		</span>
	</label>
</form>


{:else}
	<!-- En rédaction, le texte n'appartient qu'à son auteur : les autres le
	     lisent. Le HTML vient du même moteur que les pages publiques. -->
	<article class="carte">
		<h2 class="text-2xl font-bold text-ink">{data.publication.title}</h2>
		{#if data.publication.summary}<p class="mt-3 text-ink-soft">{data.publication.summary}</p>{/if}
		<div class="contenu mt-6">{@html data.lecture}</div>
	</article>
{/if}

{#if data.droits.peutModifier}

<section class="mt-10 rounded-lg border border-brand p-5">
	<h2 class="font-bold text-brand">Supprimer cette publication</h2>
	<p class="mt-1 text-sm text-ink-soft">
		La publication et ses {data.publication.commentCount} commentaire{data.publication.commentCount > 1
			? 's'
			: ''} seront définitivement effacés. Cette action est irréversible.
	</p>
	<details class="mt-3">
		<summary class="bouton-danger cursor-pointer list-none">Supprimer…</summary>
		<form method="POST" action="?/supprimer" class="mt-3">
			<p class="text-sm font-semibold text-ink">Confirmez-vous la suppression définitive ?</p>
			<button class="bouton-danger mt-2" type="submit">Oui, supprimer définitivement</button>
		</form>
	</details>
</section>

{/if}
