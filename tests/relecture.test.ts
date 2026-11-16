import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Le parcours de relecture des articles, de bout en bout, sur une base
// temporaire : rédaction → relecture → validé → en ligne.

process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'lfi-relecture-')), 'test.db');
const { db } = await import('../src/lib/server/db.ts');
const { createPublication, updatePublication, getById, getPublishedBySlug } =
	await import('../src/lib/server/content.ts');
const {
	droitsRelecture,
	envoyerEnRelecture,
	validerArticle,
	demanderCorrections,
	laisserUnMot,
	publierArticle,
	retirerDuSite,
	verifierModifiable,
	verifierVersion,
	historiqueRelecture,
	tableauRelecture,
	compterARelire
} = await import('../src/lib/server/relecture.ts');

// Trois comptes ordinaires et le propriétaire du site.
const AUTEUR = 1;
const RELECTEUR = 2;
const TIERS = 3;
const PROPRIETAIRE = 4;
for (const [nom, role] of [
	['auteur', 'admin'],
	['relecteur', 'admin'],
	['tiers', 'admin'],
	['proprietaire', 'owner']
]) {
	db()
		.prepare('insert into admins (username, display_name, password_hash, role, created_at) values (?, ?, ?, ?, ?)')
		.run(nom, nom, 'inutilise', role, new Date().toISOString());
}

const saisie = {
	kind: 'article' as const,
	title: 'Un article',
	summary: 'Chapô',
	body: 'Première version',
	status: 'draft' as const,
	commentsOpen: true,
	coverMediaId: null,
	authorName: 'auteur',
	authorAdminId: AUTEUR,
	eventAt: null,
	eventCategory: 'autre' as const
};
let numero = 0;
const creer = () => createPublication({ ...saisie, title: `Un article ${++numero}` }, AUTEUR);
const etape = (id: number) => droitsRelecture(id, AUTEUR).etape;
const enLigne = (id: number) => !!getPublishedBySlug(getById(id)!.slug);

test('un article naît en brouillon, même si le formulaire demande « publié »', () => {
	const id = createPublication({ ...saisie, title: 'Pressé', status: 'published' }, AUTEUR);
	assert.equal(getById(id)!.status, 'draft');
	assert.equal(etape(id), 'redaction');
	assert.equal(enLigne(id), false);
});

test('enregistrer un article ne change jamais son état', () => {
	const id = creer();
	updatePublication(id, { ...saisie, status: 'published' }, { reslug: false });
	assert.equal(getById(id)!.status, 'draft', 'le formulaire ne met pas en ligne');

	envoyerEnRelecture(id, AUTEUR);
	validerArticle(id, RELECTEUR);
	publierArticle(id, AUTEUR);
	updatePublication(id, { ...saisie, body: 'Coquille corrigée', status: 'draft' }, { reslug: false });
	assert.equal(getById(id)!.status, 'published', 'le formulaire ne retire pas du site');
});

test('le parcours complet : quatre étapes, deux personnes', () => {
	const id = creer();
	assert.equal(etape(id), 'redaction');

	// Personne d'autre que l'auteur n'envoie, et rien ne se valide avant l'envoi.
	assert.throws(() => envoyerEnRelecture(id, RELECTEUR));
	assert.throws(() => validerArticle(id, RELECTEUR));
	assert.throws(() => publierArticle(id, AUTEUR));

	envoyerEnRelecture(id, AUTEUR);
	assert.equal(etape(id), 'relecture');

	// L'auteur ne se relit pas lui-même, et rien ne se publie avant la validation.
	assert.throws(() => validerArticle(id, AUTEUR));
	assert.throws(() => publierArticle(id, AUTEUR));

	validerArticle(id, RELECTEUR);
	assert.equal(etape(id), 'valide');
	assert.equal(enLigne(id), false);

	// C'est l'auteur qui publie, pas la personne qui a relu.
	assert.throws(() => publierArticle(id, RELECTEUR));
	assert.equal(publierArticle(id, AUTEUR), false);
	assert.equal(etape(id), 'en-ligne');
	assert.equal(enLigne(id), true);

	assert.deepEqual(
		historiqueRelecture(id).map((ligne) => ligne.action),
		['publication', 'approve', 'author']
	);
});

test('qui peut modifier le texte, étape par étape', () => {
	const id = creer();
	// En rédaction : l'auteur seul (et le propriétaire).
	assert.doesNotThrow(() => verifierModifiable(id, AUTEUR));
	assert.doesNotThrow(() => verifierModifiable(id, PROPRIETAIRE));
	assert.throws(() => verifierModifiable(id, RELECTEUR));

	// Une fois envoyé : la personne qui relit peut corriger une coquille.
	envoyerEnRelecture(id, AUTEUR);
	assert.doesNotThrow(() => verifierModifiable(id, RELECTEUR));
	assert.doesNotThrow(() => verifierModifiable(id, AUTEUR));
});

test('demander des corrections renvoie à la rédaction, avec un mot obligatoire', () => {
	const id = creer();
	envoyerEnRelecture(id, AUTEUR);

	assert.throws(() => demanderCorrections(id, RELECTEUR, '   '), /Écrivez ce qui doit être repris/);
	assert.throws(() => demanderCorrections(id, AUTEUR, 'Je me corrige'));
	demanderCorrections(id, RELECTEUR, 'Le chiffre du deuxième paragraphe n’a pas de source.');
	assert.equal(etape(id), 'redaction');

	// L'auteur retrouve la demande sur sa page, puis renvoie son texte.
	const mien = tableauRelecture(AUTEUR).mesArticles.find((article) => article.id === id)!;
	assert.match(mien.corrections, /pas de source/);
	envoyerEnRelecture(id, AUTEUR);
	assert.equal(tableauRelecture(AUTEUR).mesArticles.find((article) => article.id === id)!.corrections, '');

	// Un article déjà validé peut encore être renvoyé à son auteur.
	validerArticle(id, RELECTEUR);
	demanderCorrections(id, TIERS, 'Le titre est trompeur.');
	assert.equal(etape(id), 'redaction');
});

test('corriger un texte validé ne retire pas la validation, changer d’auteur si', () => {
	const id = creer();
	envoyerEnRelecture(id, AUTEUR);
	validerArticle(id, RELECTEUR);

	updatePublication(id, { ...saisie, body: 'Virgule ajoutée' }, { reslug: false });
	assert.equal(etape(id), 'valide');

	updatePublication(id, { ...saisie, authorAdminId: TIERS, authorName: 'tiers' }, { reslug: false });
	assert.equal(droitsRelecture(id, TIERS).etape, 'redaction');
});

test('une validation ne vaut pas pour une version modifiée entre-temps', () => {
	const id = creer();
	envoyerEnRelecture(id, AUTEUR);
	const lue = droitsRelecture(id, RELECTEUR).revision;
	assert.doesNotThrow(() => verifierVersion(id, lue));

	updatePublication(id, { ...saisie, body: 'Réécrit pendant la relecture' }, { reslug: false });
	assert.throws(() => verifierVersion(id, lue), /modifié par quelqu’un d’autre/);
});

test('le propriétaire du site peut publier sans relecture, et c’est noté', () => {
	const id = creer();
	assert.equal(droitsRelecture(id, RELECTEUR).peutPublierSansRelecture, false);
	assert.equal(droitsRelecture(id, AUTEUR).peutPublierSansRelecture, false);

	assert.equal(publierArticle(id, PROPRIETAIRE), true, 'signalé comme une mise en ligne sans relecture');
	assert.equal(enLigne(id), true);
	assert.equal(historiqueRelecture(id)[0].action, 'sans-relecture');
});

test('retirer un article du site le renvoie au début du parcours et hors de la une', () => {
	const id = creer();
	envoyerEnRelecture(id, AUTEUR);
	validerArticle(id, RELECTEUR);
	publierArticle(id, AUTEUR);
	db().prepare('update publications set pinned = 1, pinned_order = 1 where id = ?').run(id);

	retirerDuSite(id, TIERS);
	assert.equal(etape(id), 'redaction');
	assert.equal(enLigne(id), false);
	assert.equal(getById(id)!.pinned, 0);
	assert.throws(() => retirerDuSite(id, TIERS), /n’est pas en ligne/);
});

test('la page Relecture : ce qui m’attend, et mes articles en cours', () => {
	const avant = compterARelire(RELECTEUR);
	const id = creer();
	// Un brouillon pas encore envoyé n'attend personne.
	assert.equal(compterARelire(RELECTEUR), avant);

	envoyerEnRelecture(id, AUTEUR);
	assert.equal(compterARelire(RELECTEUR), avant + 1);
	assert.ok(tableauRelecture(RELECTEUR).aRelire.some((article) => article.id === id));
	// L'auteur ne voit pas son propre article dans « à relire ».
	assert.ok(!tableauRelecture(AUTEUR).aRelire.some((article) => article.id === id));
	assert.ok(tableauRelecture(AUTEUR).mesArticles.some((article) => article.id === id));

	validerArticle(id, RELECTEUR);
	assert.equal(compterARelire(RELECTEUR), avant);
});

test('un mot ne change pas l’étape, et un rendez-vous ne suit pas ce parcours', () => {
	const id = creer();
	laisserUnMot(id, RELECTEUR, 'Je regarde ça ce soir.');
	assert.equal(etape(id), 'redaction');
	assert.throws(() => laisserUnMot(id, RELECTEUR, ''));

	const rendezVous = createPublication(
		{ ...saisie, kind: 'actu', title: 'Réunion', status: 'published', eventAt: '2027-01-12', eventCategory: 'reunion' },
		AUTEUR
	);
	assert.equal(getById(rendezVous)!.status, 'published', 'un rendez-vous se publie directement');
	assert.equal(droitsRelecture(rendezVous, RELECTEUR).etape, null);
	assert.equal(droitsRelecture(rendezVous, RELECTEUR).peutModifier, true);

	// Devenu article, il repart en brouillon pour être relu comme les autres.
	updatePublication(rendezVous, { ...saisie, title: 'Réunion', status: 'published' }, { reslug: false });
	assert.equal(getById(rendezVous)!.status, 'draft');
});
