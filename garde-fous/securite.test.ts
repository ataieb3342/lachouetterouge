import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fichiersDuSite, lire, lister } from './fichiers.ts';

/**
 * Les règles de sécurité de CLAUDE.md qu'une machine peut vérifier.
 *
 * Le site est une cible politique. Chacune de ces règles ferme une faille
 * connue ; les assouplir « pour que ça marche » la rouvre. Si l'un de ces
 * tests échoue, c'est le changement qu'il faut revoir, pas le test.
 */

// `media.ts` crée son dossier à l'import : on l'envoie dans un dossier temporaire.
process.env.UPLOADS_PATH = mkdtempSync(join(tmpdir(), 'lfi-garde-fous-'));
const { renderMarkdown } = await import('../src/lib/markdown.ts');
const { rendreCompteRendu } = await import('../src/lib/markdown-compte-rendu.ts');
const { sniffImage } = await import('../src/lib/server/media.ts');

test('règle 1 - le HTML écrit dans un texte n’est jamais interprété', () => {
	const attaque = '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[clic](javascript:alert(1))';
	for (const [nom, rendre] of [
		['articles', renderMarkdown],
		['comptes rendus', rendreCompteRendu]
	] as const) {
		const html = rendre(attaque);
		assert.ok(!/<script/i.test(html), `${nom} : une balise <script> est passée.`);
		assert.ok(!/<img[^>]+onerror/i.test(html), `${nom} : un attribut onerror est passé.`);
		assert.ok(!/href="javascript:/i.test(html), `${nom} : un lien javascript: est passé.`);
	}
	// Les blocs d'image et de bulle des articles ne recopient rien de leur JSON.
	const bloc = '```element-article\n{"kind":"bubble","text":"<script>alert(1)</script>","color":"\\"><script>"}\n```';
	assert.ok(!/<script/i.test(renderMarkdown(bloc)), 'Une bulle a laissé passer du HTML.');

	for (const fichier of fichiersDuSite()) {
		assert.ok(!/html:\s*true/.test(lire(fichier)), `${fichier} : un moteur Markdown est configuré avec html: true.`);
	}
});

test('règle 1 bis - aucun nouvel endroit n’affiche du HTML brut', () => {
	// `{@html}` affiche une chaîne sans l'échapper. Chaque usage ci-dessous a été
	// relu : il affiche le résultat d'un moteur de rendu fermé, ou des données
	// structurées. En ajouter un demande la même relecture.
	const AUTORISES = [
		'src/lib/components/ArticleEditor.svelte',
		'src/lib/components/EditeurCompteRendu.svelte',
		'src/lib/components/FormulairePublication.svelte',
		'src/lib/components/Metadonnees.svelte',
		'src/routes/[rubrique=rubrique]/[slug]/+page.svelte',
		'src/routes/admin/(interne)/comptes-rendus/[id]/+page.svelte',
		'src/routes/admin/(interne)/publications/[id]/+page.svelte'
	];
	const trouves = lister('src', ['.svelte']).filter((fichier) => lire(fichier).includes('{@html'));
	assert.deepEqual(
		trouves.filter((fichier) => !AUTORISES.includes(fichier)),
		[],
		'Nouveau {@html} : ce qu’il affiche doit sortir de renderMarkdown ou être échappé, et être relu.'
	);
});

test('règle 2 - la politique de sécurité du navigateur (CSP) n’a pas bougé', () => {
	const config = lire('vite.config.ts');
	const bloc = config.slice(config.indexOf('csp:'));
	const directives = Object.fromEntries(
		[...bloc.matchAll(/'([a-z-]+)':\s*\[([^\]]*)\]/g)].map((trouve) => [
			trouve[1],
			[...trouve[2].matchAll(/'([^']+)'/g)].map((valeur) => valeur[1])
		])
	);
	assert.deepEqual(
		directives,
		{
			'default-src': ['none'],
			'script-src': ['self'],
			'style-src': ['self'],
			'style-src-attr': ['unsafe-inline'],
			'img-src': ['self', 'data:'],
			'font-src': ['self'],
			'connect-src': ['self'],
			'form-action': ['self'],
			'base-uri': ['none'],
			'object-src': ['none'],
			'frame-ancestors': ['none'],
			'manifest-src': ['self']
		},
		'La CSP de vite.config.ts a changé. Pas de domaine extérieur, pas de unsafe-inline sur les scripts : ' +
			'le site promet de n’utiliser aucun service tiers.'
	);
});

test('règle 2 bis - rien n’est chargé depuis un autre site', () => {
	const EXTERIEUR = /<iframe|<script[^>]+src=["']https?:|<link[^>]+href=["']https?:|@import\s+url\(|url\(["']?https?:/i;
	for (const fichier of [...lister('src', ['.svelte', '.css', '.html'])]) {
		assert.ok(
			!EXTERIEUR.test(lire(fichier)),
			`${fichier} charge une ressource extérieure (police, script, iframe). Les polices et les images sont servies par le site.`
		);
	}
});

test('règle 5 - le SVG est refusé à l’envoi, le type vient des octets', () => {
	const svg = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
	assert.equal(sniffImage(svg), null, 'Un fichier SVG est accepté comme image.');
	const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
	assert.equal(sniffImage(png)?.mime, 'image/png');
});

test('règles 6 et 10 - la garde de l’administration et le nettoyage des images sont en place', () => {
	const crochets = lire('src/hooks.server.ts');
	assert.match(crochets, /pathname\.startsWith\('\/admin'\)/, 'hooks.server.ts ne garde plus /admin.');
	assert.match(lire('src/routes/admin/(interne)/+layout.server.ts'), /totpEnabled/, 'La double authentification n’est plus exigée.');

	// Toute image qui entre dans la médiathèque passe par le nettoyage.
	assert.match(lire('src/lib/server/media.ts'), /retirerMetadonnees\(/);
	assert.match(lire('src/lib/server/propositions-dessins.ts'), /retirerMetadonnees\(/);
	// Et `media` n'est alimentée que par ces deux fichiers.
	const quiEcritDansMedia = lister('src', ['.ts']).filter((fichier) => /insert into media\b/.test(lire(fichier)));
	assert.deepEqual(
		quiEcritDansMedia.sort(),
		['src/lib/server/demo.ts', 'src/lib/server/media.ts', 'src/lib/server/propositions-dessins.ts'],
		'Un nouveau fichier écrit dans la table media : il doit passer par storeUpload, qui retire les métadonnées.'
	);
});
