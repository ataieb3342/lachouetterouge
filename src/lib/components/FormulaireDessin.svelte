<script lang="ts">
	import { enhance } from '$app/forms';
	type ValeursDessin = {
		id: number;
		title: string;
		author: string;
		caption: string;
		alt: string;
		rights: string;
		published: boolean;
	};
	let { dessin = null }: { dessin?: ValeursDessin | null } = $props();
	const prefixe = $derived(`dessin-${dessin?.id ?? 'new'}`);
</script>

<form use:enhance method="POST" action="?/enregistrer" enctype="multipart/form-data" class="space-y-5">
	{#if dessin}<input type="hidden" name="id" value={dessin.id} />{/if}
	<div>
		<label class="etiquette" for="{prefixe}-title">Titre</label><input
			class="champ"
			id="{prefixe}-title"
			name="title"
			required
			maxlength="180"
			value={dessin?.title ?? ''}
		/>
	</div>
	<div>
		<label class="etiquette" for="{prefixe}-author">Auteur ou pseudonyme</label><input
			class="champ"
			id="{prefixe}-author"
			name="author"
			required
			maxlength="120"
			value={dessin?.author ?? ''}
		/>
	</div>
	<div>
		<label class="etiquette" for="{prefixe}-image">{dessin ? 'Remplacer l’image (facultatif)' : 'Dessin'}</label><input
			class="champ"
			type="file"
			id="{prefixe}-image"
			name="image"
			accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
			required={!dessin}
		/>
		<p class="mt-1 text-sm text-ink-faint">
			JPEG, PNG, WebP, GIF ou AVIF, 5 Mo maximum. L’image n’est ni recadrée ni retouchée ; seules ses métadonnées (position, date, appareil) sont retirées.
		</p>
	</div>
	<div>
		<label class="etiquette" for="{prefixe}-alt"
			>Description du dessin pour les personnes qui ne voient pas l’image</label
		><textarea class="champ" id="{prefixe}-alt" name="alt" required maxlength="300" rows="3"
			>{dessin?.alt ?? ''}</textarea
		>
	</div>
	<div>
		<label class="etiquette" for="{prefixe}-caption">Légende (facultative)</label><textarea
			class="champ"
			id="{prefixe}-caption"
			name="caption"
			maxlength="2000"
			rows="3">{dessin?.caption ?? ''}</textarea
		>
	</div>
	<div>
		<label class="etiquette" for="{prefixe}-rights">Conditions de partage convenues avec l’auteur</label><textarea
			class="champ"
			id="{prefixe}-rights"
			name="rights"
			required
			maxlength="500"
			rows="2"
			placeholder="Précisez les mentions à conserver et les utilisations autorisées.">{dessin?.rights ?? ''}</textarea
		>
	</div>
	<label class="flex items-start gap-3 text-sm text-ink-soft"
		><input class="mt-1" type="checkbox" name="permission" required />Je dispose de l’autorisation de l’auteur pour
		publier ce dessin et proposer son téléchargement.</label
	>
	<label class="flex items-center gap-3 font-semibold text-ink"
		><input type="checkbox" name="published" checked={dessin?.published ?? false} />Afficher dans la galerie publique</label
	>
	<button class="bouton" type="submit">{dessin ? 'Enregistrer les modifications' : 'Ajouter le dessin'}</button>
</form>
