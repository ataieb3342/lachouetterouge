import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Les trois formats d'article (actu, article, série) et les séries, décidés
// en réunion le 25 novembre 2026, sur une base temporaire. Et ce qu'il reste
// de l'agenda : on ne crée plus d'événement ni de formation.

process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'chouette-series-')), 'test.db');
const { db } = await import('../src/lib/server/db.ts');
const { createPublication, updatePublication, getById, listArticlesDeSerie, listPublished, countPublished } =
	await import('../src/lib/server/content.ts');
const { creerSerie, supprimerSerie, listSeries, getSerieParSlug } = await import('../src/lib/server/series.ts');
const { lirePublication, ErreurFormulaire } = await import('../src/lib/server/formulaires.ts');
const { presentPublication } = await import('../src/lib/server/present.ts');

db()
	.prepare('insert into admins (username, display_name, password_hash, role, created_at) values (?, ?, ?, ?, ?)')
	.run('auteur', 'auteur', 'inutilise', 'admin', new Date().toISOString());
const AUTEUR = 1;

const saisie = {
	kind: 'article' as const,
	title: 'Un article',
	summary: '',
	body: 'Texte',
	status: 'draft' as const,
	commentsOpen: true,
	coverMediaId: null,
	authorName: 'auteur',
	eventAt: null,
	eventCategory: 'autre' as const
};

/** Crée un article et le met en ligne directement, sans passer par la relecture. */
function enLigne(champs: Partial<typeof saisie> & Record<string, unknown>) {
	const id = createPublication({ ...saisie, ...champs }, AUTEUR);
	db().prepare("update publications set status = 'published', published_at = ? where id = ?").run(new Date().toISOString(), id);
	return id;
}

test('une série a une adresse tirée de son titre, unique', () => {
	const a = creerSerie({ titre: 'La santé', presentation: '' });
	const b = creerSerie({ titre: 'La santé', presentation: '' });
	const slugs = listSeries().map((serie) => serie.slug);
	assert.deepEqual(slugs, ['la-sante', 'la-sante-2']);
	assert.equal(getSerieParSlug('la-sante')!.id, a);
	assert.equal(supprimerSerie(b), 'ok');
});

test('les articles d’une série se lisent dans l’ordre des rangs, puis des dates', () => {
	const serie = creerSerie({ titre: 'L’économie', presentation: 'Un fil' });
	const sansRang = enLigne({ title: 'Sans rang', formatArticle: 'serie', serieId: serie });
	const deuxieme = enLigne({ title: 'Deuxième', formatArticle: 'serie', serieId: serie, rangSerie: 2 });
	const premier = enLigne({ title: 'Premier', formatArticle: 'serie', serieId: serie, rangSerie: 1 });
	assert.deepEqual(
		listArticlesDeSerie(serie).map((a) => a.id),
		[premier, deuxieme, sansRang]
	);
	const vue = presentPublication(getById(premier)!);
	assert.deepEqual(vue.serie, { id: serie, titre: 'L’économie', slug: 'l-economie', rang: 1 });
});

test('une série qui contient des articles ne se supprime pas', () => {
	const serie = creerSerie({ titre: 'Pleine', presentation: '' });
	enLigne({ title: 'Épisode', formatArticle: 'serie', serieId: serie });
	assert.equal(supprimerSerie(serie), 'pas-vide');
	assert.ok(listSeries().some((s) => s.id === serie));
});

test('changer de format efface la série et le rang', () => {
	const serie = creerSerie({ titre: 'Temporaire', presentation: '' });
	const id = enLigne({ title: 'Changeant', formatArticle: 'serie', serieId: serie, rangSerie: 3 });
	updatePublication(id, { ...saisie, title: 'Changeant', formatArticle: 'actu', serieId: serie, rangSerie: 3 }, { reslug: false });
	const fiche = getById(id)!;
	assert.equal(fiche.format_article, 'actu');
	assert.equal(fiche.serie_id, null);
	assert.equal(fiche.rang_serie, null);
	assert.equal(supprimerSerie(serie), 'ok');
});

test('un apéro garde le format par défaut, sans série', () => {
	const serie = creerSerie({ titre: 'Pas pour les apéros', presentation: '' });
	const id = createPublication(
		{ ...saisie, kind: 'apero', eventAt: '2027-01-04', eventCategory: 'apero', formatArticle: 'serie', serieId: serie },
		AUTEUR
	);
	assert.equal(getById(id)!.format_article, 'article');
	assert.equal(getById(id)!.serie_id, null);
});

test('la page Articles filtre par format', () => {
	enLigne({ title: 'Une actu', formatArticle: 'actu' });
	const actus = listPublished({ kind: 'article', format: 'actu' });
	assert.ok(actus.length > 0);
	assert.ok(actus.every((a) => a.format_article === 'actu'));
	assert.equal(countPublished('article', undefined, 'actu'), actus.length);
});

function formulaire(champs: Record<string, string>) {
	const form = new FormData();
	for (const [nom, valeur] of Object.entries({ title: 'Titre', body: 'Texte', status: 'draft', ...champs })) {
		form.set(nom, valeur);
	}
	return form;
}

test('le formulaire refuse un article de série sans série', async () => {
	await assert.rejects(lirePublication(formulaire({ kind: 'article', formatArticle: 'serie' }), AUTEUR, null), ErreurFormulaire);
	await assert.rejects(
		lirePublication(formulaire({ kind: 'article', formatArticle: 'chronique' }), AUTEUR, null),
		ErreurFormulaire
	);
});

test('on ne crée plus d’événement ni de formation, mais on corrige les anciens', async () => {
	const evenement = formulaire({ kind: 'reunion', eventAt: '2027-01-12' });
	await assert.rejects(lirePublication(evenement, AUTEUR, null), /plus d’agenda/);
	const corrige = await lirePublication(evenement, AUTEUR, null, null, 'actu');
	assert.equal(corrige.kind, 'actu');
	assert.equal(corrige.eventCategory, 'reunion');
});
