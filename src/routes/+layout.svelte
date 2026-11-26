<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { afterNavigate } from '$app/navigation';
	import Logo from '$lib/components/Logo.svelte';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';
	import { LIEN_GROUPE, LIEN_REJOINDRE, LIENS_PRINCIPAUX, MENU_RESSOURCES, PIED_DE_PAGE } from '$lib/structure';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	// Ce que contiennent l'en-tête, le menu Ressources et le pied de page est
	// décidé dans `structure.ts`, qui est verrouillé : ce fichier-ci ne fait
	// que l'afficher. Pour ajouter une page à la navigation, c'est là-bas - et
	// jamais dans les liens principaux.
	const liensPrincipaux = LIENS_PRINCIPAUX;
	const groupesNavigation = [MENU_RESSOURCES];

	function actif(href: string): boolean {
		return href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
	}

	function sectionActive(sections: readonly string[]): boolean {
		return sections.some(actif);
	}

	// « Ressources » s'allume sur chacune de ses pages, pas seulement sur la
	// bibliothèque : sur /dessins ou /jeux, plus rien ne disait où l'on était.
	function groupeActif(groupe: (typeof groupesNavigation)[number]): boolean {
		return groupe.liens.some((lien) => actif(lien.href));
	}

	const annee = new Date().getFullYear();

	// Le menu mobile est un <details> : il reste ouvert tant qu'on ne le ferme
	// pas. Comme le site navigue sans recharger la page, on le referme nous-mêmes
	// une fois arrivé sur la page choisie.
	let menu = $state<HTMLDetailsElement | null>(null);
	let menusBureau = $state<HTMLDetailsElement[]>([]);
	afterNavigate(() => {
		if (menu) menu.open = false;
		for (const menuBureau of menusBureau) menuBureau.open = false;
	});

	function enregistrerMenu(element: HTMLDetailsElement, index: number) {
		menusBureau[index] = element;
		return {
			destroy() {
				menusBureau = menusBureau.filter((menuBureau) => menuBureau !== element);
			}
		};
	}

	function fermerAutres(index: number) {
		if (!menusBureau[index]?.open) return;
		menusBureau.forEach((element, autreIndex) => {
			if (autreIndex !== index) element.open = false;
		});
	}

	const groupesPied = PIED_DE_PAGE;

	const affichages = [
		{ valeur: 'auto', label: 'Automatique' },
		{ valeur: 'clair', label: 'Clair' },
		{ valeur: 'sombre', label: 'Sombre' }
	] as const;
</script>

<a class="skip-link" href="#contenu-principal">Aller au contenu</a>

{#if data.demo}
	<!-- Site de démonstration : tout ce qui est publié ici est fictif. -->
	<div class="bg-amber-300 text-sm text-amber-950">
		<p class="mx-auto max-w-5xl px-4 py-2">
			<strong>Site de démonstration.</strong> Les articles, rendez-vous et commentaires sont fictifs.
			L'espace d'administration est ouvert à l'essai :
			<a class="font-semibold underline underline-offset-2" href="/admin">essayez-le</a>.
		</p>
	</div>
{/if}

{#if data.admin}
	<!-- Bandeau visible uniquement pour un administrateur connecté. -->
	<div class="bg-ink text-surface text-sm">
		<div class="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
			<span class="opacity-70">Connecté·e comme <strong>{data.admin.displayName}</strong></span>
			<a class="underline underline-offset-2 hover:text-brand" href="/admin">Administration</a>
			<form method="POST" action="/admin/deconnexion" class="ml-auto">
				<button class="underline underline-offset-2 hover:text-brand" type="submit">Se déconnecter</button>
			</form>
		</div>
	</div>
{/if}

<!-- Filet aux couleurs de la chouette, présent sur toutes les pages. -->
<div class="filet-degrade h-1" aria-hidden="true"></div>

<header class="border-b border-line bg-carte">
	<div class="mx-auto flex max-w-5xl items-center gap-4 px-4 py-4">
		<a href="/" class="flex items-center gap-3 no-underline">
			<Logo class="h-10 w-auto shrink-0" />
			<span class="leading-tight">
				<span class="block text-lg font-extrabold tracking-tight text-ink">{data.settings.siteName}</span>
				<!-- Le sous-titre est masqué sur mobile : à côté du logo et du bouton
				     de menu, il se coupait sur deux lignes serrées. -->
				<span class="mt-0.5 hidden text-xs font-medium text-ink-faint sm:block">{data.settings.tagline}</span>
			</span>
		</a>

		<!-- Navigation bureau -->
		<nav class="ml-auto hidden md:block" aria-label="Navigation principale">
			<ul class="flex items-center gap-1">
				{#each liensPrincipaux as lien (lien.href)}
					<li>
						<a
							href={lien.href}
							aria-current={sectionActive(lien.sections) ? 'page' : undefined}
							class="block rounded-full px-3 py-1.5 text-sm font-semibold transition-colors
								{sectionActive(lien.sections) ? 'bg-brand-soft text-brand' : 'text-ink-soft hover:bg-surface-alt hover:text-ink'}"
							>{lien.label}</a
						>
					</li>
				{/each}
				{#each groupesNavigation as groupe, index (groupe.href)}
					<li>
						<div class="flex items-center rounded-full {groupeActif(groupe) ? 'bg-brand-soft text-brand' : ''}">
							<a
								href={groupe.href}
								aria-current={actif(groupe.href) ? 'page' : undefined}
								class="rounded-l-full py-1.5 pr-1 pl-3 text-sm font-semibold
									{groupeActif(groupe) ? '' : 'text-ink-soft hover:text-ink'}">{groupe.label}</a
							>
							<details
								class="navigation-deroulante relative"
								use:enregistrerMenu={index}
								ontoggle={() => fermerAutres(index)}
							>
								<summary
									class="grid cursor-pointer list-none place-items-center rounded-r-full py-2 pr-3 pl-1
										{groupeActif(groupe) ? '' : 'text-ink-soft hover:text-ink'}"
									aria-label="Ouvrir le menu {groupe.label}"
								>
									<svg class="h-3.5 w-3.5 transition-transform" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
										<path d="m5 7 5 5 5-5" />
									</svg>
								</summary>
								<ul class="absolute right-0 z-30 mt-2 w-56 rounded-xl border border-line bg-carte p-2 shadow-lg">
									{#each groupe.liens as lien (lien.href)}
										<li>
											<a class="block rounded-lg px-3 py-2 text-sm font-semibold text-ink-soft hover:bg-surface-alt hover:text-ink" href={lien.href}>{lien.label}</a>
										</li>
									{/each}
								</ul>
							</details>
						</div>
					</li>
				{/each}
				<li>
					<a
						href={LIEN_GROUPE.href}
						aria-current={actif(LIEN_GROUPE.href) ? 'page' : undefined}
						class="block rounded-full px-3 py-1.5 text-sm font-semibold transition-colors
							{actif(LIEN_GROUPE.href) ? 'bg-brand-soft text-brand' : 'text-ink-soft hover:bg-surface-alt hover:text-ink'}"
						>{LIEN_GROUPE.label}</a
					>
				</li>
				<li class="ml-1">
					<a href={LIEN_REJOINDRE.href} class="bouton px-4 py-1.5 text-sm">{LIEN_REJOINDRE.label}</a>
				</li>
			</ul>
		</nav>

		<!-- Navigation mobile : un <details>, donc aucun JavaScript nécessaire -->
		<details class="relative ml-auto md:hidden" bind:this={menu}>
			<summary
				class="cursor-pointer list-none rounded border border-line-forte px-3 py-2 text-sm font-semibold text-ink"
				>Menu</summary
			>
			<nav
				class="absolute right-0 z-20 mt-2 w-56 rounded-lg border border-line bg-carte p-2 shadow-lg"
				aria-label="Navigation principale"
			>
				<ul class="space-y-2">
					{#each liensPrincipaux as lien (lien.href)}
						<li><a class="block rounded px-3 py-2 font-bold text-ink" href={lien.href}>{lien.label}</a></li>
					{/each}
					{#each groupesNavigation as groupe (groupe.href)}
						<li class="border-t border-line pt-2">
							<a class="block rounded px-3 py-2 font-bold text-ink" href={groupe.href}>{groupe.label}</a>
							<ul class="ml-3 border-l border-line pl-2">
								{#each groupe.liens as lien (lien.href)}
									<li><a class="block rounded px-3 py-1.5 text-sm text-ink-soft" href={lien.href}>{lien.label}</a></li>
								{/each}
							</ul>
						</li>
					{/each}
					<li class="border-t border-line pt-2">
						<a class="block rounded px-3 py-2 font-bold text-ink" href={LIEN_GROUPE.href}>{LIEN_GROUPE.label}</a>
					</li>
					<li><a class="bouton mt-1 w-full justify-center" href={LIEN_REJOINDRE.href}>{LIEN_REJOINDRE.label}</a></li>
				</ul>
			</nav>
		</details>
	</div>
</header>

<main id="contenu-principal" class="mx-auto min-h-[60vh] max-w-5xl px-4 py-6">
	{@render children()}
</main>

<!-- Pas de marge haute : le rembourrage bas de `<main>` fait déjà l'écart, et
     le passage à une surface sombre marque la rupture à lui seul. -->
<footer class="fond-degrade-sombre">
	<!-- Sur grand écran, la présentation à gauche et les liens en trois colonnes.
	     En une seule liste de onze liens, la colonne de droite faisait plus de
	     400 pixels de haut, et la moitié gauche restait vide sous la présentation. -->
	<div class="mx-auto grid max-w-5xl gap-8 px-4 py-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
		<div>
			<div class="flex items-center gap-3">
				<Logo variante="mono" class="h-10 w-auto shrink-0 text-white" />
				<p class="text-lg font-extrabold tracking-tight text-white">{data.settings.siteName}</p>
			</div>
			<p class="mt-4 max-w-md text-sm text-pretty text-white/75">
				La chouette rouge est un collectif militant indépendant du centre de Dijon. Ce site
				n'est celui d'aucun parti, d'aucun candidat ni d'aucune campagne électorale.
			</p>
			{#if data.settings.contactEmail}
				<p class="mt-3 text-sm">
					<a class="font-semibold text-white underline underline-offset-2" href="mailto:{data.settings.contactEmail}"
						>{data.settings.contactEmail}</a
					>
				</p>
			{/if}
		</div>
		<nav aria-label="Pied de page" class="grid grid-cols-2 gap-8 sm:grid-cols-3">
			{#each groupesPied as groupe (groupe.titre)}
				<div>
					<h2 class="text-xs font-bold tracking-[0.2em] text-white/60 uppercase">{groupe.titre}</h2>
					<ul class="mt-3 space-y-2 text-sm text-white/80">
						{#each groupe.liens as lien (lien.href)}
							<li><a class="hover:text-white hover:underline" href={lien.href}>{lien.label}</a></li>
						{/each}
					</ul>
				</div>
			{/each}
		</nav>
	</div>
	<div class="border-t border-white/15">
		<div class="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4">
			<p class="text-xs text-white/60">© {annee} - Ce site ne dépose aucun cookie de mesure d'audience.</p>

			<!-- Choix d'affichage. Un formulaire ordinaire : le serveur pose un
			     cookie et renvoie sur la même page, sans JavaScript. -->
			<form method="POST" action="/theme" class="flex flex-wrap items-center gap-x-3 gap-y-2">
				<p id="affichage-titre" class="text-xs font-semibold text-white/70">Affichage</p>
				<div class="flex flex-wrap gap-2" role="group" aria-labelledby="affichage-titre">
					{#each affichages as a (a.valeur)}
						<button
							type="submit"
							name="theme"
							value={a.valeur}
							aria-pressed={data.theme === a.valeur}
							class="rounded-full border px-3 py-1 text-sm font-semibold transition-colors
								{data.theme === a.valeur
								? 'border-white bg-white text-[#0f0c0d]'
								: 'border-white/40 text-white/85 hover:border-white hover:text-white'}">{a.label}</button
						>
					{/each}
				</div>
			</form>
		</div>
	</div>
</footer>
