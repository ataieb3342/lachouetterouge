import { db, now } from './db.ts';

/**
 * Les dessins et caricatures de la galerie `/dessins`.
 *
 * Un dessin est une fiche (titre, auteur, légende, conditions de partage)
 * reliée à une image de la médiathèque. Il arrive par deux chemins : un
 * administrateur l'ajoute lui-même (Administration → Dessins), ou un visiteur
 * le propose et l'équipe l'accepte (`propositions-dessins.ts`).
 *
 * La table et ses colonnes sont en anglais (`drawings`, `title`…) : elles sont
 * parties en production ainsi, et une migration ne se réécrit pas.
 */

export type Dessin = {
	id: number;
	title: string;
	author: string;
	caption: string;
	alt: string;
	rights: string;
	media_id: number;
	published: number;
	created_at: string;
	updated_at: string;
};

/** Ce que saisit la personne qui ajoute ou propose un dessin. */
export type ChampsDessin = Pick<Dessin, 'title' | 'author' | 'caption' | 'alt' | 'rights' | 'published'>;

/** Les dessins, du plus récent au plus ancien. Les brouillons restent hors de la galerie. */
export function listerDessins(avecBrouillons = false): Dessin[] {
	const filtre = avecBrouillons ? '' : 'where published = 1';
	return db().prepare(`select * from drawings ${filtre} order by created_at desc, id desc`).all() as Dessin[];
}

export function trouverDessin(id: number, avecBrouillons = false): Dessin | undefined {
	if (!Number.isSafeInteger(id) || id <= 0) return undefined;
	const filtre = avecBrouillons ? '' : 'and published = 1';
	return db().prepare(`select * from drawings where id = ? ${filtre}`).get(id) as Dessin | undefined;
}

/**
 * Lit et valide le formulaire d'un dessin, le même pour l'administration et
 * pour la proposition publique.
 *
 * Le nom de l'auteur, la description pour les personnes qui ne voient pas
 * l'image et les conditions de partage sont obligatoires : un dessin publié
 * sans eux serait soit anonyme, soit inaccessible, soit d'un usage incertain.
 * `exigerAutorisation` vaut `false` quand l'équipe accepte une proposition :
 * la case a déjà été cochée par la personne qui l'a envoyée.
 */
export function lireChampsDessin(form: FormData, exigerAutorisation = true): ChampsDessin {
	const title = String(form.get('title') ?? '').trim();
	const author = String(form.get('author') ?? '').trim();
	const caption = String(form.get('caption') ?? '').trim();
	const alt = String(form.get('alt') ?? '').trim();
	const rights = String(form.get('rights') ?? '').trim();

	if (!title || title.length > 180) throw new Error('Indiquez un titre de 180 caractères maximum.');
	if (!author || author.length > 120) {
		throw new Error('Indiquez le nom ou pseudonyme de l’auteur (120 caractères maximum).');
	}
	if (!alt || alt.length > 300) throw new Error('Décrivez le dessin en 300 caractères maximum.');
	if (caption.length > 2000 || rights.length > 500) {
		throw new Error('La légende ou les conditions de partage sont trop longues.');
	}
	if (!rights) throw new Error('Précisez les conditions de partage convenues avec l’auteur.');
	if (exigerAutorisation && form.get('permission') !== 'on') {
		throw new Error('Confirmez l’autorisation de publication de ce dessin.');
	}

	return { title, author, caption, alt, rights, published: form.get('published') === 'on' ? 1 : 0 };
}

/** Crée la fiche (`id` nul) ou la met à jour ; renvoie son identifiant. */
export function enregistrerDessin(id: number | null, champs: ChampsDessin, mediaId: number): number {
	const valeurs = [champs.title, champs.author, champs.caption, champs.alt, champs.rights, mediaId, champs.published];

	if (id !== null) {
		db()
			.prepare(
				`update drawings
				    set title = ?, author = ?, caption = ?, alt = ?, rights = ?, media_id = ?, published = ?, updated_at = ?
				  where id = ?`
			)
			.run(...valeurs, now(), id);
		return id;
	}

	const maintenant = now();
	const resultat = db()
		.prepare(
			`insert into drawings (title, author, caption, alt, rights, media_id, published, created_at, updated_at)
			 values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.run(...valeurs, maintenant, maintenant);
	return Number(resultat.lastInsertRowid);
}

/** Supprime la fiche. L'image reste dans la médiathèque, où on peut la retirer à part. */
export function supprimerDessin(id: number) {
	db().prepare('delete from drawings where id = ?').run(id);
}
