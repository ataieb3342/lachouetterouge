<script lang="ts">
	/**
	 * La chouette rouge, dessinée pour le site en novembre 2026.
	 *
	 * Une chouette et non un hibou : la tête est ronde, sans aigrettes, comme
	 * la chouette hulotte. La tête en cœur, le disque facial, les yeux ocre et le sourcil en V la rendent reconnaissable
	 * même à vingt pixels de haut.
	 *
	 * Le SVG est écrit dans le composant plutôt que chargé comme image : il prend
	 * ainsi la couleur du texte parent en variante « mono », et ne coûte aucune
	 * requête réseau supplémentaire. Les mêmes tracés sont repris dans
	 * `static/favicon.svg`.
	 *
	 * `variante` :
	 *   - « couleur » : rouge, yeux ocre, pour les fonds clairs comme sombres
	 *     (les yeux sont dessinés, pas découpés : ils ne prennent pas la
	 *     couleur du fond)
	 *   - « mono »    : une seule couleur héritée du parent, pour les surfaces
	 *     colorées ; les yeux, le bec et les ailes y sont découpés
	 */
	let {
		variante = 'couleur',
		class: classe = ''
	}: { variante?: 'couleur' | 'mono'; class?: string } = $props();

	// La silhouette, commune aux deux variantes : tête en cœur, corps en écusson.
	const SILHOUETTE =
		'M50 15C42 6 30 3 20 7C11 11 7 23 7 39C7 66 18 92 34 108C40 113 45 115 50 115C55 115 60 113 66 108C82 92 93 66 93 39C93 23 89 11 80 7C70 3 58 6 50 15Z';
</script>

<svg class={classe} viewBox="0 0 100 120" fill="none" aria-hidden="true" focusable="false">
	{#if variante === 'couleur'}
		<!-- Corps, puis ailes plus sombres sur les côtés. -->
		<path fill="#e01b24" d={SILHOUETTE} />
		<path
			fill="#a8101a"
			d="M12 52C12 76 21 95 37 109C29 93 25 76 27 60Z M88 52C88 76 79 95 63 109C71 93 75 76 73 60Z"
		/>
		<!-- Disque facial, puis les yeux et le sourcil en V qui les coiffe. -->
		<path
			fill="#ff4a3d"
			d="M50 31C46 24 39 21 31 21C19 21 11 30 11 41C11 53 20 61 31 61C39 61 45 58 50 53C55 58 61 61 69 61C81 61 89 53 89 41C89 30 81 21 69 21C61 21 54 24 50 31Z"
		/>
		<circle cx="31" cy="41" r="12" fill="#f4b13a" />
		<circle cx="69" cy="41" r="12" fill="#f4b13a" />
		<circle cx="31" cy="41" r="6.5" fill="#1e1614" />
		<circle cx="69" cy="41" r="6.5" fill="#1e1614" />
		<path fill="#ff4a3d" d="M17 26L50 37L83 26L83 31L50 42L17 31Z" />
		<path fill="#1e1614" d="M45 51L55 51L50 63Z" />
		<!-- Plumes de la poitrine. -->
		<g stroke="#a8101a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
			<path d="M39 78L44 83L49 78" />
			<path d="M51 78L56 83L61 78" />
			<path d="M45 90L50 95L55 90" />
		</g>
	{:else}
		<!-- `evenodd` : les yeux, le bec et les ailes sont des trous dans la
		     silhouette, par lesquels on voit la surface colorée. -->
		<path
			fill="currentColor"
			fill-rule="evenodd"
			d="{SILHOUETTE} M20.5 34.6A12 12 0 1 0 41.5 34.6L31 31.1Z M58.5 34.6A12 12 0 1 0 79.5 34.6L69 31.1Z M45 51L55 51L50 63Z M15 58C16.5 76 23.5 92 34.5 104C28 93 23.5 79 21.5 63Z M85 58C83.5 76 76.5 92 65.5 104C72 93 76.5 79 78.5 63Z"
		/>
		<circle cx="31" cy="41" r="6.5" fill="currentColor" />
		<circle cx="69" cy="41" r="6.5" fill="currentColor" />
	{/if}
</svg>
