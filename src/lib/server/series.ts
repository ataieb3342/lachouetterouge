import { db, now } from './db.ts';
import { slugify } from './content.ts';

/**
 * Les séries d'articles (table `series`), gérées depuis Administration →
 * Séries.
 *
 * Une série est un fil conducteur que plusieurs articles suivent, thème par
 * thème, avec une structure commune - décidé en réunion le 25 novembre 2026.
 * Chaque article de la série a le format « serie » et pointe vers elle
 * (`publications.serie_id`) ; son rang (`rang_serie`) fixe l'ordre de
 * lecture. Sans rang, il vient après ceux qui en ont un, par date.
 *
 * La page publique de chaque série est `/series/<slug>`, et la liste de
 * toutes `/series`. L'ordre des séries est celui de `position`, choisi à la
 * main.
 */

export type Serie = {
	id: number;
	slug: string;
	titre: string;
	presentation: string;
	position: number;
	created_at: string;
	updated_at: string;
};

/** Une série avec le nombre de ses articles : tous, et ceux en ligne. */
export type SerieAvecCompte = Serie & { articles: number; en_ligne: number };

export type ChampsSerie = { titre: string; presentation: string };

const TITRE_MAX = 120;
const PRESENTATION_MAX = 600;

export function listSeries(): SerieAvecCompte[] {
	return db()
		.prepare(
			`select s.*,
			 (select count(*) from publications p where p.serie_id = s.id and p.kind = 'article') as articles,
			 (select count(*) from publications p
			  where p.serie_id = s.id and p.kind = 'article' and p.status = 'published') as en_ligne
			 from series s
			 order by s.position, s.id`
		)
		.all() as SerieAvecCompte[];
}

export function getSerie(id: number): Serie | undefined {
	return db().prepare('select * from series where id = ?').get(id) as Serie | undefined;
}

export function getSerieParSlug(slug: string): Serie | undefined {
	return db().prepare('select * from series where slug = ?').get(slug) as Serie | undefined;
}

/**
 * Vérifie le formulaire d'une série. Le titre devient aussi l'adresse de la
 * page (`/series/la-sante`) : il est obligatoire.
 */
export function lireChampsSerie(form: FormData): ChampsSerie | { erreur: string } {
	const titre = String(form.get('titre') ?? '').trim();
	const presentation = String(form.get('presentation') ?? '').trim();
	if (!titre) return { erreur: 'Donnez un titre à la série.' };
	if (titre.length > TITRE_MAX) return { erreur: `Le titre est trop long (${TITRE_MAX} caractères au plus).` };
	if (presentation.length > PRESENTATION_MAX) {
		return { erreur: `La présentation est trop longue (${PRESENTATION_MAX} caractères au plus).` };
	}
	if (!slugify(titre)) return { erreur: 'Le titre doit contenir au moins une lettre ou un chiffre.' };
	return { titre, presentation };
}

/** Une adresse unique parmi les séries : « la-sante », puis « la-sante-2 »… */
function slugUnique(titre: string, sauf?: number): string {
	const base = slugify(titre) || 'serie';
	let candidat = base;
	for (let i = 2; ; i++) {
		const pris = db().prepare('select id from series where slug = ? and id is not ?').get(candidat, sauf ?? null);
		if (!pris) return candidat;
		candidat = `${base}-${i}`;
	}
}

export function creerSerie(champs: ChampsSerie): number {
	const horodatage = now();
	const derniere = db().prepare('select coalesce(max(position), 0) as n from series').get() as { n: number };
	const resultat = db()
		.prepare(
			`insert into series (slug, titre, presentation, position, created_at, updated_at)
			 values (?, ?, ?, ?, ?, ?)`
		)
		.run(slugUnique(champs.titre), champs.titre, champs.presentation, derniere.n + 1, horodatage, horodatage);
	return Number(resultat.lastInsertRowid);
}

/**
 * Modifie une série. L'adresse de sa page ne change pas avec le titre : elle a
 * peut-être déjà été partagée.
 */
export function modifierSerie(id: number, champs: ChampsSerie) {
	db()
		.prepare('update series set titre = ?, presentation = ?, updated_at = ? where id = ?')
		.run(champs.titre, champs.presentation, now(), id);
}

/**
 * Supprime une série vide. Une série qui contient encore des articles est
 * refusée : il faut d'abord les rattacher à une autre ou changer leur format,
 * sinon des articles se retrouveraient « épisode » d'une série disparue.
 */
export function supprimerSerie(id: number): 'ok' | 'pas-vide' {
	const { n } = db().prepare('select count(*) as n from publications where serie_id = ?').get(id) as { n: number };
	if (n > 0) return 'pas-vide';
	db().prepare('delete from series where id = ?').run(id);
	return 'ok';
}

/** Monte ou descend une série d'un cran, en échangeant sa place avec sa voisine. */
export function deplacerSerie(id: number, sens: 'haut' | 'bas') {
	const series = listSeries();
	const i = series.findIndex((s) => s.id === id);
	const j = sens === 'haut' ? i - 1 : i + 1;
	if (i < 0 || j < 0 || j >= series.length) return;
	const echanger = db().prepare('update series set position = ? where id = ?');
	echanger.run(j + 1, series[i].id);
	echanger.run(i + 1, series[j].id);
	// Les autres sont renumérotées dans l'ordre affiché, pour qu'aucune
	// égalité de position ne rende l'ordre imprévisible.
	series.forEach((s, k) => {
		if (k !== i && k !== j) echanger.run(k + 1, s.id);
	});
}

/** Les séries proposées dans le formulaire de publication, dans leur ordre. */
export function choixSeries(): { id: number; titre: string }[] {
	return listSeries().map((serie) => ({ id: serie.id, titre: serie.titre }));
}
