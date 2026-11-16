<script lang="ts">
	import type { Droits, LigneHistorique } from '$lib/server/relecture';
	import { formatDateTime } from '$lib/format';

	/**
	 * Le suivi d'un article, en tête de sa fiche dans l'administration : où il
	 * en est de ses quatre étapes, ce que la personne connectée a à faire, et
	 * ce qui s'est dit jusqu'ici.
	 *
	 * Toutes les règles sont dans `relecture.ts` ; ce composant ne fait que
	 * montrer ce que `droits` permet. Ses boutons appartiennent au formulaire
	 * de la publication (`form={formulaire}`) : ils enregistrent le texte en
	 * cours avant de faire avancer l'article, pour que personne ne perde ce
	 * qu'il vient d'écrire. Quand le texte n'est pas modifiable, il n'y a pas
	 * de formulaire, et le mot à laisser est envoyé seul.
	 */
	let {
		droits,
		historique,
		formulaire,
		actionPrincipale,
		erreur = ''
	}: {
		droits: Droits;
		historique: LigneHistorique[];
		/** L'identifiant du formulaire de la publication, ou `null` en lecture seule. */
		formulaire: string | null;
		actionPrincipale: { libelle: string; action: string; aide: string } | null;
		erreur?: string;
	} = $props();

	const ETAPES = [
		{ cle: 'redaction', nom: 'Rédaction' },
		{ cle: 'relecture', nom: 'Relecture' },
		{ cle: 'valide', nom: 'Validé' },
		{ cle: 'en-ligne', nom: 'En ligne' }
	] as const;
	const rang = $derived(ETAPES.findIndex((etape) => etape.cle === droits.etape));

	// Une seule phrase, qui dit où en est l'article et à qui c'est le tour.
	const situation = $derived.by(() => {
		switch (droits.etape) {
			case 'redaction':
				return droits.peutEnvoyer
					? 'Votre article est en rédaction. Quand il est prêt, envoyez-le en relecture.'
					: 'Cet article est en rédaction : son auteur ne l’a pas encore envoyé en relecture.';
			case 'relecture':
				return droits.peutValider
					? 'Cet article attend une relecture. Lisez-le, corrigez ce qui doit l’être, puis validez-le ou demandez des corrections.'
					: 'Votre article attend qu’une autre personne le relise. Vous pouvez encore le corriger.';
			case 'valide':
				return droits.peutPublier
					? 'Votre article est validé. Il ne reste qu’à le mettre en ligne.'
					: 'Cet article est validé. C’est à son auteur de le mettre en ligne.';
			default:
				return 'Cet article est en ligne. Toute l’équipe peut le corriger.';
		}
	});

	// Les corrections demandées restent en vue tant que l'auteur n'a pas renvoyé son texte.
	const corrections = $derived.by(() => {
		if (droits.etape !== 'redaction') return null;
		const derniere = historique.find((ligne) => ligne.action !== 'comment');
		return derniere?.action === 'corrections' ? derniere : null;
	});
	const mots = $derived(historique.filter((ligne) => ligne.action === 'comment').slice(0, 3));
</script>

<section class="carte mb-6" aria-label="Suivi de l'article">
	<!-- Les quatre étapes, toujours dans le même ordre. -->
	<ol class="flex flex-wrap gap-x-2 gap-y-1 text-sm">
		{#each ETAPES as etape, i (etape.cle)}
			<li
				aria-current={i === rang ? 'step' : undefined}
				class="rounded-full px-3 py-1 font-semibold
					{i === rang ? 'bg-brand text-sur-brand' : i < rang ? 'bg-brand-soft text-brand' : 'bg-surface-alt text-ink-faint'}"
			>
				{i + 1}. {etape.nom}
			</li>
		{/each}
	</ol>

	<p class="mt-4 font-bold text-ink">{situation}</p>
	{#if erreur}<p class="alerte mt-3" role="alert">{erreur}</p>{/if}

	{#if corrections}
		<p class="mt-3 rounded-lg border border-line-forte bg-surface-alt p-3 text-sm text-ink">
			<span class="font-semibold">Corrections demandées par {corrections.nom} :</span>
			{corrections.note}
		</p>
	{/if}
	{#each mots as mot (mot.id)}
		<p class="mt-2 rounded-lg bg-surface-alt p-3 text-sm text-ink-soft">
			<span class="font-semibold text-ink">{mot.nom} :</span>
			{mot.note}
		</p>
	{/each}

	{#if actionPrincipale && formulaire}
		<div class="mt-4">
			<button class="bouton" type="submit" form={formulaire} formaction={actionPrincipale.action}>
				{actionPrincipale.libelle}
			</button>
			<p class="aide">{actionPrincipale.aide}</p>
		</div>
	{/if}

	<!-- Un seul champ pour écrire à l'autre : « demander des corrections »
	     renvoie l'article à son auteur, « laisser ce mot » ne change rien. -->
	<details class="mt-4">
		<summary class="cursor-pointer text-sm font-semibold text-brand">
			{droits.peutDemanderCorrections ? 'Demander des corrections ou laisser un mot' : 'Laisser un mot'}
		</summary>
		{#snippet champMot()}
			<label class="etiquette mt-3" for="mot-relecture">Votre mot</label>
			<textarea
				id="mot-relecture"
				name="mot"
				class="champ"
				rows="3"
				maxlength="2000"
				form={formulaire ?? undefined}
			></textarea>
			<div class="mt-3 flex flex-wrap gap-2">
				{#if droits.peutDemanderCorrections}
					<button
						class="bouton-secondaire"
						type="submit"
						form={formulaire ?? undefined}
						formaction="?/corrections"
					>
						Demander des corrections
					</button>
				{/if}
				<button class="bouton-secondaire" type="submit" form={formulaire ?? undefined} formaction="?/mot">
					Laisser ce mot
				</button>
			</div>
			{#if droits.peutDemanderCorrections}
				<p class="aide">
					Demander des corrections renvoie l’article à son auteur, qui devra le renvoyer en relecture.
				</p>
			{/if}
		{/snippet}
		{#if formulaire}
			{@render champMot()}
		{:else}
			<form method="POST">{@render champMot()}</form>
		{/if}
	</details>

	{#if droits.peutPublierSansRelecture && formulaire}
		<!-- La sortie de secours du propriétaire du site : un communiqué urgent,
		     un auteur qui n'est plus là. Chaque usage est inscrit au journal. -->
		<details class="mt-3">
			<summary class="cursor-pointer text-sm text-ink-soft">Mettre en ligne sans relecture…</summary>
			<p class="mt-2 text-sm text-ink-soft">
				Réservé au propriétaire du site, pour une urgence. L’article sort sans qu’une deuxième personne l’ait lu,
				et c’est inscrit au journal.
			</p>
			<button class="bouton-danger mt-2" type="submit" form={formulaire} formaction="?/publier">
				Enregistrer et mettre en ligne sans relecture
			</button>
		</details>
	{/if}

	{#if droits.peutRetirer && formulaire}
		<details class="mt-3">
			<summary class="cursor-pointer text-sm text-ink-soft">Retirer du site…</summary>
			<p class="mt-2 text-sm text-ink-soft">
				L’article quitte le site et la une, et redevient un brouillon. Il devra être relu de nouveau avant de
				revenir en ligne.
			</p>
			<button class="bouton-danger mt-2" type="submit" form={formulaire} formaction="?/retirer">
				Retirer cet article du site
			</button>
		</details>
	{/if}

	{#if historique.length}
		<details class="mt-3">
			<summary class="cursor-pointer text-sm text-ink-soft">Historique</summary>
			<ul class="mt-2 space-y-1 text-xs text-ink-soft">
				{#each historique as ligne (ligne.id)}
					<li>
						{formatDateTime(ligne.date)} · {ligne.nom} · {ligne.libelle}{ligne.note ? ` : ${ligne.note}` : ''}
					</li>
				{/each}
			</ul>
		</details>
	{/if}
</section>
