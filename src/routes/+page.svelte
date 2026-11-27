<script lang="ts">
	import { page } from '$app/state';
	import CarteArticle from '$lib/components/CarteArticle.svelte';
	import Metadonnees from '$lib/components/Metadonnees.svelte';
	import { organisation } from '$lib/donnees-structurees';
	import { mediasParFormat } from '$lib/medias';
	import { COULEUR_KIND, formatDate, formatDateCourte, formatDateLongue, formatHeure, LIBELLE_EVENEMENT, libelleFiche, lienPublication } from '$lib/format';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const premiereUne = $derived(data.aLaUne[0] ?? null);

	/** Les trois morceaux de la date « calendrier » : « lun. », « 7 », « déc. ». */
	const enDate = (iso: string | null) => new Date(`${iso}T12:00:00`);
	const jourSemaine = (iso: string | null) => enDate(iso).toLocaleDateString('fr-FR', { weekday: 'short' });
	const jourDuMois = (iso: string | null) => enDate(iso).getDate();
	const mois = (iso: string | null) => enDate(iso).toLocaleDateString('fr-FR', { month: 'short' });
</script>

<!-- Le titre de l'accueil porte la devise en plus du nom : c'est la ligne que
     Google affiche, et le nom seul ne dit pas ce qu'on y trouve. -->
<Metadonnees
	titre="{data.settings.siteName} - {data.settings.tagline}"
	description={data.settings.description}
	image={premiereUne?.cover?.url ?? null}
	donnees={organisation(page.url.origin, data.settings, data.apero)}
/>

<!--
	L'accueil s'ouvre sur ce qui se passe, pas sur un slogan : la devise d'une
	ligne à gauche, le prochain rendez-vous à droite (dessous sur téléphone).

	Ce bloc a d'abord été un fil de six rendez-vous qui défilait au doigt. Il
	montre maintenant le prochain en grand, avec ce qui donne envie de venir -
	la date, le lieu, et pour un apéro le dossier partagé -, puis les trois
	suivants, un par ligne. Le fil suffisait quand l'agenda était plein ; il
	paraissait vide avec un ou deux rendez-vous. Sans rendez-vous annoncé, le
	bloc propose le résumé du dernier apéro : il n'est jamais vide.

	Le tout est posé sur la surface rouge et noire du site : c'est le seul pavé
	coloré de la page, et la fiche claire y ressort comme une carte posée
	dessus. Seul le texte hors de la fiche est blanc.
-->
<section aria-labelledby="titre-accueil" class="fond-degrade overflow-hidden rounded-2xl px-4 py-5 sm:px-6 sm:py-6">
	<!-- `minmax(0, …)` partout, téléphone compris : sans lui, une colonne de
	     grille prend la largeur de son contenu, et les lignes coupées
	     (`truncate`) de « Ensuite » élargissaient le bloc hors de l'écran. -->
	<div class="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,23rem)] md:items-center md:gap-8">
		<div>
			<p class="text-xs font-bold tracking-[0.14em] text-white uppercase">Collectif militant · Dijon Centre</p>
			<h1 id="titre-accueil" class="titre-affiche mt-1 text-2xl text-white sm:text-3xl">
				Agir ici, discuter ensemble, changer les choses.
			</h1>
			<!-- Masqué sur téléphone : la fiche du rendez-vous, juste dessous, dit
			     déjà tout, et chaque ligne repousse les articles. -->
			<p class="mt-3 max-w-md text-sm text-white/80 max-md:hidden">
				{data.apero.rythme}, un apéro autour d’un thème choisi à l’avance. Ouvert à toutes et tous, sans rien
				avoir préparé.
			</p>
		</div>

		<div>
			{#if data.prochain}
				{@const rdv = data.prochain}
				{@const estApero = rdv.kind === 'apero'}
				{@const lieu = rdv.eventLocation || (estApero ? data.apero.lieu : '')}
				{@const heure = rdv.eventStartTime ? formatHeure(rdv.eventStartTime) : estApero ? data.apero.heure : ''}
				{@const lien = lienPublication(rdv.kind, rdv.slug)}
				<!-- Le titre est étendu à toute la fiche (`::after`) ; le lien du
				     dossier passe devant (`relative`) pour rester cliquable. La
				     couleur est celle du type (`agenda-*` d'app.css), comme dans
				     l'agenda. -->
				<article class="agenda-{rdv.eventCategory} group relative flex gap-4 rounded-xl border-t-4 border-current bg-carte p-4">
					<!-- La date comme sur un calendrier de bureau : on la lit avant
					     le reste. -->
					<p class="flex w-14 shrink-0 flex-col items-center rounded-lg bg-surface-alt py-1.5" aria-hidden="true">
						<span class="text-xs font-bold uppercase">{jourSemaine(rdv.eventAt)}</span>
						<span class="titre-affiche text-3xl leading-none">{jourDuMois(rdv.eventAt)}</span>
						<span class="text-xs font-bold">{mois(rdv.eventAt)}</span>
					</p>
					<div class="min-w-0 flex-1">
						<p class="text-xs font-bold tracking-wide uppercase">
							{LIBELLE_EVENEMENT[rdv.eventCategory]}{rdv.jour ? ` · ${rdv.jour}` : ''}
						</p>
						<h2 class="mt-0.5 leading-snug font-bold text-ink">
							<a href={lien} class="line-clamp-2 after:absolute after:inset-0 group-hover:text-brand group-hover:underline">
								<span class="sr-only">{formatDateLongue(rdv.eventAt)} : </span>{rdv.title}
							</a>
						</h2>
						{#if heure || lieu}
							<p class="mt-1 text-sm text-ink-soft">{[heure, lieu].filter(Boolean).join(' · ')}</p>
						{/if}
						{#if estApero}
							<a class="relative mt-2 inline-block text-sm font-semibold text-brand hover:underline" href="{lien}#sources">
								{rdv.sources
									? `Préparer la soirée : ${rdv.sources} lecture${rdv.sources > 1 ? 's' : ''} proposée${rdv.sources > 1 ? 's' : ''} →`
									: 'Proposer une lecture pour préparer la soirée →'}
							</a>
						{/if}
					</div>
				</article>

				{#if data.suivants.length}
					<!-- Une ligne par rendez-vous, coupée si le titre est long : en
					     une seule phrase, trois titres faisaient quatre lignes
					     emmêlées sur téléphone. -->
					<p class="mt-4 text-xs font-bold tracking-[0.14em] text-white uppercase">Ensuite</p>
					<ul class="mt-1 space-y-0.5 text-sm text-white">
						{#each data.suivants as suivant (suivant.id)}
							<li class="truncate">
								<a class="underline-offset-2 hover:underline" href={lienPublication(suivant.kind, suivant.slug)}
									><span class="font-semibold">{formatDateCourte(suivant.eventAt)}</span> · {suivant.title}</a
								>
							</li>
						{/each}
					</ul>
				{/if}
				<p class="mt-2 text-sm">
					<a class="font-semibold text-white underline-offset-2 hover:underline" href="/agenda">Tout l’agenda →</a>
				</p>
			{:else}
				<div class="rounded-xl border-t-4 border-ocre bg-carte p-4">
					<p class="text-xs font-bold tracking-wide text-ocre uppercase">L’agenda</p>
					<p class="mt-0.5 font-bold text-ink">Le prochain rendez-vous sera annoncé ici.</p>
					{#if data.dernierApero}
						<p class="mt-1 text-sm text-ink-soft">
							En attendant, le dernier apéro :
							<a class="font-semibold text-brand hover:underline" href={lienPublication(data.dernierApero.kind, data.dernierApero.slug)}
								>{data.dernierApero.title}</a
							>.
						</p>
					{/if}
					<a class="mt-2 inline-block text-sm font-semibold text-brand hover:underline" href="/aperos">Tous les apéros et leurs résumés →</a>
				</div>
			{/if}
		</div>
	</div>
</section>

{#if data.aLaUne.length}
	<section class="border-b border-line py-6">
		<h2 class="mb-4 text-xs font-bold tracking-[0.14em] text-brand uppercase">À la une</h2>
		<!-- La première fiche en grand ; les suivantes en cartes compactes, deux
		     par ligne, avec une petite vignette. Avec de grandes images partout,
		     une fiche sans image posée à côté d'une fiche illustrée était étirée
		     à sa hauteur et restait vide, et une fiche seule sur la dernière
		     ligne laissait un trou à côté. La grande fiche prend toute la
		     largeur quand le reste est pair, sinon elle se range comme les autres
		     pour que la grille tombe juste. -->
		<div class="grid gap-4 md:grid-cols-2">
			{#each data.aLaUne as publication, i (publication.id)}
				{@const large = i === 0 && (data.aLaUne.length === 1 || data.aLaUne.length % 2 === 1)}
				{@const illustree = large && publication.cover}
				<a
					href={lienPublication(publication.kind, publication.slug)}
					class="group flex min-w-0 overflow-hidden rounded-xl border border-line bg-carte transition hover:-translate-y-0.5 hover:border-brand {large
						? 'flex-col md:col-span-2' + (illustree ? ' md:grid md:grid-cols-2' : '')
						: 'gap-4 p-4'}"
				>
					{#if illustree && publication.cover}
						<div class="grid aspect-video w-full min-w-0 place-items-center overflow-hidden bg-surface-alt">
							<img
								src={publication.cover.url}
								alt={publication.cover.alt}
								class="block h-full max-h-full w-full max-w-full object-contain"
							/>
						</div>
					{/if}
					<div class="min-w-0 flex-1 {large ? 'p-4 sm:p-6 md:self-center' : ''}">
						<p class="text-xs font-bold tracking-wide uppercase {COULEUR_KIND[publication.kind]}">
							{libelleFiche(publication)}
							{#if publication.eventAt}
								<span class="text-ink-faint"> · {formatDateCourte(publication.eventAt)}</span>
							{/if}
						</p>
						<h3
							class="titre-affiche mt-2 text-ink group-hover:text-brand {large
								? 'text-2xl sm:text-3xl'
								: 'line-clamp-3 text-xl'}"
						>
							{publication.title}
						</h3>
						{#if publication.summary}
							<p class="mt-2 text-ink-soft {large ? 'line-clamp-3' : 'line-clamp-2 text-sm'}">{publication.summary}</p>
						{/if}
						{#if !publication.eventAt}
							<p class="mt-2 text-xs text-ink-faint">
								{formatDate(publication.publishedAt)}{publication.authorName ? ` · ${publication.authorName}` : ''}
							</p>
						{/if}
					</div>
					{#if !large && publication.cover}
						<!-- `alt` vide : la vignette illustre le titre qui la précède. -->
						<img
							src={publication.cover.url}
							alt=""
							class="size-24 shrink-0 self-start rounded-lg bg-surface-alt object-cover sm:size-28"
						/>
					{/if}
				</a>
			{/each}
		</div>
	</section>
{/if}

<!-- Les derniers articles, sur toute la largeur et dans la grille de la page
     Articles. La moitié droite portait « Plus tard dans l'agenda », la suite
     du fil du haut : on coupait la page entre deux sujets, et une liste de
     rendez-vous lointains n'apprenait rien que « Tout l'agenda » ne donne
     déjà. `pt-6` et non `py-6` : ce qui suit apporte sa propre marge haute.
     Masquée quand le seul article existant est déjà « à la une » : un titre
     de section suivi du vide fait plus négligé qu'utile. -->
{#if data.articles.length || !data.aLaUne.length}
	<section class="pt-6">
		<div class="mb-6 flex items-baseline justify-between border-b border-line pb-2">
			<h2 class="text-xl font-extrabold text-ink">Derniers articles</h2>
			<a class="text-sm font-semibold text-brand hover:underline" href="/articles">Tout voir</a>
		</div>

		{#if data.articles.length}
			<div class="grid gap-5 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-8 lg:grid-cols-3">
				{#each data.articles as article (article.id)}
					<CarteArticle publication={article} />
				{/each}
			</div>
		{:else}
			<p class="text-ink-soft">Aucun article publié pour le moment.</p>
		{/if}
	</section>
{/if}

<!-- Les médias qu'on recommande, sous les articles. La liste peut être
     longue - il y a beaucoup de médias qui valent le détour - et la section
     doit tenir quel que soit leur nombre :

     - une phrase dit pourquoi on les recommande, puis ils sont rangés par
       format (« À regarder », « À lire »), une rangée par format ;
     - sur ordinateur, tous sont visibles d'un coup, en grille de trois
       cartes compactes (la phrase tient sur deux lignes) ;
     - sur téléphone, chaque rangée défile au doigt, comme le fil des
       rendez-vous (`scroll-snap`, aucun script) : la carte suivante qui
       dépasse à droite dit qu'il y en a d'autres. Empilés, quinze médias
       feraient défiler trois écrans.

     Pas de carrousel à diapositives : presque personne ne va au-delà de la
     première, et les autres médias seraient cachés. Les liens sortent du
     site : la flèche ↗ l'annonce, nouvel onglet, `noopener noreferrer`.
     Pas en tête de page : l'accueil montre d'abord ce que fait le groupe. -->
{#if data.medias.length}
	{@const formats = mediasParFormat(data.medias)}
	<section class="mt-8 border-t border-line pt-6" aria-labelledby="titre-medias">
		<div class="flex flex-wrap items-baseline justify-between gap-x-4">
			<p class="text-xs font-bold tracking-[0.14em] text-ocre uppercase">On recommande</p>
			<a class="text-sm font-semibold text-brand hover:underline" href="/medias">Tous les médias →</a>
		</div>
		<h2 id="titre-medias" class="titre-affiche mt-1 text-2xl text-ink">S’informer ailleurs</h2>
		<p class="mt-2 max-w-2xl text-ink-soft">
			Des médias indépendants, hors des groupes de milliardaires, que nous regardons et lisons nous-mêmes.
		</p>

		{#each formats as format (format.id)}
			<div class="mt-5">
				<h3 class="text-xs font-bold tracking-[0.15em] text-ink-faint uppercase">
					{format.titre} <span class="font-semibold tracking-normal normal-case">· {format.medias.length}</span>
				</h3>
				<ul
					class="fil-jours mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 lg:grid-cols-3"
				>
					{#each format.medias as media (media.id)}
						<li class="carte group relative flex w-64 shrink-0 snap-start items-start gap-3 transition hover:border-brand sm:w-auto">
							<!-- Logo décoratif : le nom du média suit, `alt` vide pour ne pas le lire deux fois. -->
							<img class="size-10 shrink-0 rounded-lg object-cover" src={media.logo} alt="" width="40" height="40" loading="lazy" />
							<div class="min-w-0">
								<p class="font-bold text-ink">
									<a
										class="after:absolute after:inset-0 group-hover:text-brand"
										href={media.lien}
										target="_blank"
										rel="noopener noreferrer"
									>
										{media.nom}<span class="ml-1 text-ink-faint" aria-hidden="true">↗</span>
									</a>
								</p>
								<p class="mt-0.5 line-clamp-3 text-sm leading-snug text-ink-soft">{media.description}</p>
							</div>
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</section>
{/if}
