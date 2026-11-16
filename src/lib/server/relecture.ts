import { db, now, transaction } from './db.ts';

/**
 * La relecture des articles : un article n'est mis en ligne qu'après avoir été
 * lu par une deuxième personne.
 *
 * Quatre étapes, toujours dans cet ordre, et une seule chose à faire à chacune :
 *
 * | Étape       | Ce qui s'y passe                         | Qui agit                   |
 * | ----------- | ---------------------------------------- | -------------------------- |
 * | `redaction` | l'auteur écrit                           | l'auteur : « envoyer »     |
 * | `relecture` | quelqu'un d'autre lit, et corrige s'il veut | un autre compte : « valider » ou « demander des corrections » |
 * | `valide`    | le texte attend sa mise en ligne         | l'auteur : « publier »     |
 * | `en-ligne`  | l'article est sur le site                | tout le monde peut corriger |
 *
 * « Demander des corrections » renvoie à la rédaction, avec un mot qui dit
 * quoi reprendre. C'est l'auteur qui publie, pas la personne qui relit : il
 * garde la main sur le moment où son texte sort.
 *
 * Trois règles qu'on pourrait croire oubliées :
 *
 * - **Corriger un texte validé ne retire pas la validation.** La première
 *   version annulait tout à la moindre virgule : plus personne ne corrigeait
 *   rien. Ce qui la retire, c'est de changer l'auteur ou le type de la fiche.
 * - **Le propriétaire du site peut publier sans relecture.** Sans cette
 *   sortie de secours, un communiqué urgent attend qu'un deuxième compte se
 *   connecte, et un article dont l'auteur a quitté le groupe reste bloqué
 *   pour toujours. Chaque usage est inscrit dans l'historique et au journal.
 * - **Les autres types de publication ne passent pas par ici** : un
 *   rendez-vous se publie directement.
 *
 * Deux choses viennent de la base et non de ce fichier (migrations 022 à
 * 029) : la ligne de suivi est créée par un déclencheur à la création d'un
 * article, et un autre augmente `revision` à chaque modification du texte -
 * c'est ce numéro qui permet de refuser une validation donnée sur une version
 * que quelqu'un a modifiée entre-temps. Les colonnes sont en anglais : elles
 * sont parties en production ainsi, et une migration ne se réécrit pas.
 * `author_approved_by` veut dire « envoyé en relecture par », `reviewer_id`
 * « validé par ».
 */

/** Refus du parcours de relecture : le message s'adresse à la personne connectée. */
export class ErreurRelecture extends Error {}

export type Etape = 'redaction' | 'relecture' | 'valide' | 'en-ligne';

export const LIBELLE_ETAPE: Record<Etape, string> = {
	redaction: 'En rédaction',
	relecture: 'En relecture',
	valide: 'Validé, prêt à publier',
	'en-ligne': 'En ligne'
};

type Suivi = {
	revision: number;
	author_approved_by: number | null;
	reviewer_id: number | null;
};

type Article = {
	id: number;
	kind: string;
	status: string;
	/** Le compte de l'auteur : celui choisi dans le formulaire, sinon celui qui a créé la fiche. */
	auteur: number | null;
};

export type Droits = {
	/** `null` pour une publication qui n'est pas un article : elle ne suit pas ce parcours. */
	etape: Etape | null;
	revision: number;
	estAuteur: boolean;
	peutModifier: boolean;
	peutEnvoyer: boolean;
	peutValider: boolean;
	peutDemanderCorrections: boolean;
	peutPublier: boolean;
	/** La sortie de secours du propriétaire du site. */
	peutPublierSansRelecture: boolean;
	peutRetirer: boolean;
};

/** Ce qu'on inscrit dans l'historique, et comment on le dit. */
const LIBELLE_ACTION: Record<string, string> = {
	author: 'Envoyé en relecture',
	approve: 'Validé',
	corrections: 'Corrections demandées',
	comment: 'Mot laissé',
	publication: 'Mis en ligne',
	'sans-relecture': 'Mis en ligne sans relecture',
	retrait: 'Retiré du site',
	// Actions de la première version du parcours, gardées pour que les anciens
	// historiques restent lisibles.
	advice: 'Avis demandé',
	advice_reply: 'Avis donné',
	request: 'Autre avis demandé',
	priority: 'Priorité modifiée',
	reopen: 'Nouvelle relecture demandée'
};

function trouverArticle(id: number): Article | undefined {
	return db()
		.prepare('select id, kind, status, coalesce(byline_admin_id, author_id) as auteur from publications where id = ?')
		.get(id) as Article | undefined;
}

function lireSuivi(id: number): Suivi {
	// Le déclencheur crée la ligne avec l'article ; ceci couvre une fiche
	// devenue article par un autre chemin.
	db().prepare('insert or ignore into article_reviews (publication_id) values (?)').run(id);
	return db()
		.prepare('select revision, author_approved_by, reviewer_id from article_reviews where publication_id = ?')
		.get(id) as Suivi;
}

function etapeDe(article: Article, suivi: Suivi): Etape {
	if (article.status === 'published') return 'en-ligne';
	if (!suivi.author_approved_by) return 'redaction';
	return suivi.reviewer_id ? 'valide' : 'relecture';
}

function estProprietaire(adminId: number): boolean {
	return !!db().prepare("select 1 from admins where id = ? and role = 'owner' and disabled_at is null").get(adminId);
}

/**
 * Ce que le compte connecté peut faire de cette publication. C'est la seule
 * fonction qui décide : l'écran s'en sert pour montrer les boutons, et chaque
 * action la rappelle avant d'agir - un bouton caché n'est pas une protection.
 */
export function droitsRelecture(id: number, adminId: number): Droits {
	const article = trouverArticle(id);
	if (!article || article.kind !== 'article') {
		return {
			etape: null,
			revision: 0,
			estAuteur: false,
			peutModifier: true,
			peutEnvoyer: false,
			peutValider: false,
			peutDemanderCorrections: false,
			peutPublier: false,
			peutPublierSansRelecture: false,
			peutRetirer: false
		};
	}

	const suivi = lireSuivi(id);
	const etape = etapeDe(article, suivi);
	const estAuteur = article.auteur === adminId;
	const proprietaire = estProprietaire(adminId);
	const aLaMain = estAuteur || proprietaire;

	return {
		etape,
		revision: suivi.revision,
		estAuteur,
		// En rédaction, le texte n'appartient qu'à son auteur. Dès qu'il est
		// envoyé, la personne qui relit peut corriger elle-même une coquille
		// plutôt que de renvoyer l'article pour si peu.
		peutModifier: etape === 'redaction' ? aLaMain : true,
		peutEnvoyer: etape === 'redaction' && aLaMain,
		peutValider: etape === 'relecture' && !estAuteur,
		peutDemanderCorrections: (etape === 'relecture' || etape === 'valide') && !estAuteur,
		peutPublier: etape === 'valide' && aLaMain,
		peutPublierSansRelecture: (etape === 'redaction' || etape === 'relecture') && proprietaire,
		peutRetirer: etape === 'en-ligne'
	};
}

/** À appeler avant d'enregistrer ou de supprimer une publication. */
export function verifierModifiable(id: number, adminId: number) {
	if (!droitsRelecture(id, adminId).peutModifier) {
		throw new ErreurRelecture(
			'Cet article est encore en rédaction : seul son auteur peut le modifier. Vous pourrez le relire quand il l’aura envoyé.'
		);
	}
}

/**
 * Refuse d'agir sur une version qui n'est plus celle qu'on a lue : entre
 * l'ouverture de la page et le clic, quelqu'un d'autre a modifié le texte.
 */
export function verifierVersion(id: number, revisionLue: number) {
	if (lireSuivi(id).revision !== revisionLue) {
		throw new ErreurRelecture(
			'Le texte a été modifié par quelqu’un d’autre depuis que vous avez ouvert cette page. Rechargez-la avant de continuer.'
		);
	}
}

function noter(id: number, adminId: number, action: string, note = '') {
	db()
		.prepare(
			'insert into article_review_history (publication_id, revision, admin_id, action, note, created_at) values (?, ?, ?, ?, ?, ?)'
		)
		.run(id, lireSuivi(id).revision, adminId, action, note, now());
}

function lireNote(note: string, obligatoire: string): string {
	const texte = note.trim();
	if (!texte) throw new ErreurRelecture(obligatoire);
	if (texte.length > 2000) throw new ErreurRelecture('Ce mot est trop long (2 000 caractères maximum).');
	return texte;
}

/** Rédaction → relecture. */
export function envoyerEnRelecture(id: number, adminId: number) {
	transaction(() => {
		if (!droitsRelecture(id, adminId).peutEnvoyer) {
			throw new ErreurRelecture('Seul l’auteur peut envoyer son article en relecture.');
		}
		db()
			.prepare(
				'update article_reviews set author_approved_by = ?, author_approved_at = ?, reviewer_id = null, reviewed_at = null where publication_id = ?'
			)
			.run(adminId, now(), id);
		noter(id, adminId, 'author');
	});
}

/** Relecture → validé. */
export function validerArticle(id: number, adminId: number) {
	transaction(() => {
		if (!droitsRelecture(id, adminId).peutValider) {
			throw new ErreurRelecture('La validation doit venir d’une autre personne que l’auteur, sur un article envoyé en relecture.');
		}
		db()
			.prepare('update article_reviews set reviewer_id = ?, reviewed_at = ? where publication_id = ?')
			.run(adminId, now(), id);
		noter(id, adminId, 'approve');
	});
}

/** Relecture ou validé → rédaction, avec un mot qui dit quoi reprendre. */
export function demanderCorrections(id: number, adminId: number, note: string) {
	transaction(() => {
		if (!droitsRelecture(id, adminId).peutDemanderCorrections) {
			throw new ErreurRelecture('Vous ne pouvez pas demander de corrections sur cet article.');
		}
		const texte = lireNote(note, 'Écrivez ce qui doit être repris : l’auteur n’a que ce mot pour le savoir.');
		db()
			.prepare(
				'update article_reviews set author_approved_by = null, author_approved_at = null, reviewer_id = null, reviewed_at = null where publication_id = ?'
			)
			.run(id);
		noter(id, adminId, 'corrections', texte);
	});
}

/** Un mot dans l'historique, sans rien changer à l'étape. */
export function laisserUnMot(id: number, adminId: number, note: string) {
	transaction(() => {
		if (droitsRelecture(id, adminId).etape === null) throw new ErreurRelecture('Article introuvable.');
		noter(id, adminId, 'comment', lireNote(note, 'Écrivez votre mot avant de l’envoyer.'));
	});
}

/**
 * Validé → en ligne. Renvoie `true` quand la mise en ligne s'est faite sans
 * relecture (la sortie de secours du propriétaire), pour que le journal
 * d'audit le dise.
 */
export function publierArticle(id: number, adminId: number): boolean {
	return transaction(() => {
		const droits = droitsRelecture(id, adminId);
		if (!droits.peutPublier && !droits.peutPublierSansRelecture) {
			throw new ErreurRelecture(
				droits.etape === 'valide'
					? 'C’est à l’auteur de mettre en ligne son article validé.'
					: 'Cet article doit d’abord être validé par une autre personne.'
			);
		}
		const sansRelecture = !droits.peutPublier;
		const maintenant = now();
		db()
			.prepare(
				"update publications set status = 'published', published_at = coalesce(published_at, ?), updated_at = ? where id = ?"
			)
			.run(maintenant, maintenant, id);
		noter(id, adminId, sansRelecture ? 'sans-relecture' : 'publication');
		return sansRelecture;
	});
}

/**
 * En ligne → rédaction. L'article quitte le site et la une, et devra être
 * relu de nouveau avant d'y revenir.
 */
export function retirerDuSite(id: number, adminId: number) {
	transaction(() => {
		if (!droitsRelecture(id, adminId).peutRetirer) {
			throw new ErreurRelecture('Cet article n’est pas en ligne.');
		}
		db()
			.prepare(
				"update publications set status = 'draft', pinned = 0, pinned_order = null, pinned_at = null, updated_at = ? where id = ?"
			)
			.run(now(), id);
		db()
			.prepare(
				'update article_reviews set author_approved_by = null, author_approved_at = null, reviewer_id = null, reviewed_at = null where publication_id = ?'
			)
			.run(id);
		noter(id, adminId, 'retrait');
	});
}

export type LigneHistorique = { id: number; nom: string; action: string; libelle: string; note: string; date: string };

/** L'historique d'un article, du plus récent au plus ancien. */
export function historiqueRelecture(id: number): LigneHistorique[] {
	const lignes = db()
		.prepare(
			`select h.id, a.display_name as nom, h.action, h.note, h.created_at as date
			   from article_review_history h
			   join admins a on a.id = h.admin_id
			  where h.publication_id = ?
			  order by h.id desc`
		)
		.all(id) as Omit<LigneHistorique, 'libelle'>[];
	return lignes.map((ligne) => ({ ...ligne, libelle: LIBELLE_ACTION[ligne.action] ?? ligne.action }));
}

export type ArticleSuivi = {
	id: number;
	title: string;
	auteurNom: string;
	etape: Etape;
	libelle: string;
	/** Les corrections demandées, tant que l'auteur n'a pas renvoyé son texte. */
	corrections: string;
	modifieLe: string;
};

/**
 * La page Administration → Relecture : ce qui attend la personne connectée,
 * puis ses propres articles qui ne sont pas encore en ligne.
 */
export function tableauRelecture(adminId: number): { aRelire: ArticleSuivi[]; mesArticles: ArticleSuivi[] } {
	const lignes = db()
		.prepare(
			`select p.id, p.title, p.author_name, p.status, p.updated_at,
			        coalesce(p.byline_admin_id, p.author_id) as auteur,
			        r.author_approved_by, r.author_approved_at, r.reviewer_id, coalesce(r.revision, 1) as revision
			   from publications p
			   left join article_reviews r on r.publication_id = p.id
			  where p.kind = 'article' and p.status = 'draft'
			  order by coalesce(r.author_approved_at, p.updated_at), p.id`
		)
		.all() as (Suivi & {
		id: number;
		title: string;
		author_name: string;
		status: string;
		updated_at: string;
		auteur: number | null;
	})[];

	const aRelire: ArticleSuivi[] = [];
	const mesArticles: ArticleSuivi[] = [];

	for (const ligne of lignes) {
		const etape = etapeDe({ id: ligne.id, kind: 'article', status: ligne.status, auteur: ligne.auteur }, ligne);
		const dernier = historiqueRelecture(ligne.id).find((h) => h.action !== 'comment');
		const article: ArticleSuivi = {
			id: ligne.id,
			title: ligne.title,
			auteurNom: ligne.author_name,
			etape,
			libelle: LIBELLE_ETAPE[etape],
			corrections: etape === 'redaction' && dernier?.action === 'corrections' ? dernier.note : '',
			modifieLe: ligne.updated_at
		};
		if (ligne.auteur === adminId) mesArticles.push(article);
		else if (etape === 'relecture') aRelire.push(article);
	}
	return { aRelire, mesArticles };
}

/** Le nombre affiché à côté de « Relecture » dans le menu de l'administration. */
export function compterARelire(adminId: number): number {
	const ligne = db()
		.prepare(
			`select count(*) as n
			   from publications p
			   join article_reviews r on r.publication_id = p.id
			  where p.kind = 'article' and p.status = 'draft'
			    and r.author_approved_by is not null and r.reviewer_id is null
			    and coalesce(p.byline_admin_id, p.author_id) is not ?`
		)
		.get(adminId) as { n: number };
	return Number(ligne.n);
}
