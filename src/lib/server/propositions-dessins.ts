import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { db, now } from './db.ts';
import { UPLOADS_DIR, MAX_UPLOAD_BYTES, sniffImage } from './media.ts';
import { retirerMetadonnees } from './metadonnees-images.ts';
import { enregistrerDessin, type ChampsDessin } from './dessins.ts';

/**
 * Les dessins proposés par les visiteurs depuis `/dessins/proposer`, en
 * attente de la décision de l'équipe.
 *
 * Trois règles tiennent ce fichier :
 *
 * 1. **Rien n'est public avant d'être accepté.** Le fichier d'une proposition
 *    est rangé dans un dossier à part, sous un nom au hasard, sans ligne dans
 *    la table `media` : la route `/media/…` ne sert que ce que cette table
 *    connaît, elle ne peut donc pas le montrer. Seule une session
 *    d'administration le lit, par sa propre route.
 * 2. **Aucune image ne garde ses métadonnées** (règle de sécurité n° 10). Un
 *    dessin photographié au téléphone porte la position de l'endroit où la
 *    photo a été prise, et la galerie propose de télécharger l'original. Le
 *    fichier est nettoyé dès la réception, et une seconde fois à
 *    l'acceptation, pour les propositions reçues avant ce nettoyage.
 * 3. **La file est bornée** (`FILE_MAX`) : sans cela, un robot remplirait le
 *    disque en envoyant des images de 5 Mo.
 */

const DOSSIER_PRIVE = join(UPLOADS_DIR, '.drawing-submissions');

/** Au-delà, les envois sont refusés jusqu'à ce que l'équipe ait trié la file. */
const FILE_MAX = 100;

/** Une image plus grande que cela n'est pas décodée : elle saturerait la mémoire. */
const PIXELS_MAX = 40_000_000;

export type PropositionDessin = Omit<ChampsDessin, 'published'> & {
	id: number;
	filename: string;
	mime: string;
	bytes: number;
	created_at: string;
};

export function compterPropositions(): number {
	const ligne = db().prepare('select count(*) as n from drawing_submissions').get() as { n: number };
	return Number(ligne.n);
}

/** Les propositions en attente, de la plus ancienne à la plus récente. */
export function listerPropositions(): PropositionDessin[] {
	return db().prepare('select * from drawing_submissions order by id asc').all() as PropositionDessin[];
}

export function trouverProposition(id: number): PropositionDessin | undefined {
	if (!Number.isSafeInteger(id) || id <= 0) return undefined;
	return db().prepare('select * from drawing_submissions where id = ?').get(id) as PropositionDessin | undefined;
}

export async function lireImageProposition(proposition: PropositionDessin): Promise<Buffer> {
	return readFile(join(DOSSIER_PRIVE, proposition.filename));
}

/** Enregistre une proposition et son image ; renvoie son identifiant. */
export async function creerProposition(champs: ChampsDessin, fichier: File): Promise<number> {
	if (fichier.size <= 0 || fichier.size > MAX_UPLOAD_BYTES) {
		throw new Error('Choisissez une image de 5 Mo maximum.');
	}

	const recus = Buffer.from(await fichier.arrayBuffer());
	// Le type vient des premiers octets, jamais du nom du fichier (règle n° 5).
	const type = sniffImage(recus);
	if (!type) throw new Error('Format non reconnu. Utilisez une image JPEG, PNG, WebP, GIF ou AVIF.');

	// Seule l'image est gardée : position GPS, date et appareil partent ici.
	// Un fichier dont la structure n'est pas comprise est refusé.
	const octets = retirerMetadonnees(recus, type.mime).octets;

	// On décode l'image pour de bon : un fichier qui a la bonne signature mais
	// ne s'ouvre pas ferait une vignette cassée dans la galerie.
	try {
		await sharp(octets, { limitInputPixels: PIXELS_MAX }).resize(1, 1).toBuffer();
	} catch {
		throw new Error('Cette image est illisible ou trop grande. Choisissez un autre fichier.');
	}

	const nomFichier = `${randomUUID()}.${type.ext}`;
	await mkdir(DOSSIER_PRIVE, { recursive: true });
	await writeFile(join(DOSSIER_PRIVE, nomFichier), octets, { flag: 'wx', mode: 0o600 });

	try {
		// Le décodage est asynchrone : plusieurs envois simultanés ont pu passer
		// le premier contrôle ensemble. On recompte juste avant d'écrire en base.
		if (compterPropositions() >= FILE_MAX) {
			throw new Error('La file de vérification est pleine. Réessayez plus tard.');
		}
		const resultat = db()
			.prepare(
				`insert into drawing_submissions (title, author, caption, alt, rights, filename, mime, bytes, created_at)
				 values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.run(
				champs.title,
				champs.author,
				champs.caption,
				champs.alt,
				champs.rights,
				nomFichier,
				type.mime,
				octets.length,
				now()
			);
		return Number(resultat.lastInsertRowid);
	} catch (erreur) {
		// Pas de fichier orphelin si la base a refusé la ligne.
		await unlink(join(DOSSIER_PRIVE, nomFichier)).catch(() => {});
		throw erreur;
	}
}

/**
 * Accepte une proposition : son image entre dans la médiathèque, la fiche du
 * dessin est créée et publiée, la proposition disparaît. Renvoie l'identifiant
 * du dessin.
 */
export async function accepterProposition(id: number, champs: ChampsDessin, adminId: number): Promise<number> {
	const proposition = trouverProposition(id);
	if (!proposition) throw new Error('Proposition déjà traitée ou introuvable.');

	// Nettoyé une seconde fois : une proposition reçue avant la mise en place
	// du nettoyage a encore ses métadonnées. Sur un fichier déjà propre,
	// l'opération ne change rien.
	const octets = retirerMetadonnees(await lireImageProposition(proposition), proposition.mime).octets;

	const nomFichier = `${randomUUID()}.${proposition.filename.split('.').pop()}`;
	const destination = join(UPLOADS_DIR, nomFichier);
	await writeFile(destination, octets, { flag: 'wx', mode: 0o644 });

	let dessinId: number;
	db().exec('begin');
	try {
		// Deux personnes peuvent accepter la même proposition au même moment :
		// la seconde ne doit pas créer un doublon.
		if (!trouverProposition(id)) throw new Error('Proposition déjà traitée.');
		const media = db()
			.prepare('insert into media (filename, mime, bytes, alt, created_at, uploaded_by) values (?, ?, ?, ?, ?, ?)')
			.run(nomFichier, proposition.mime, octets.length, champs.alt, now(), adminId);
		dessinId = enregistrerDessin(null, { ...champs, published: 1 }, Number(media.lastInsertRowid));
		db().prepare('delete from drawing_submissions where id = ?').run(id);
		db().exec('commit');
	} catch (erreur) {
		db().exec('rollback');
		await unlink(destination).catch(() => {});
		throw erreur;
	}

	await unlink(join(DOSSIER_PRIVE, proposition.filename)).catch(() => {});
	return dessinId;
}

/** Refuse une proposition : la ligne et le fichier sont supprimés, rien n'est gardé. */
export async function refuserProposition(id: number) {
	const proposition = trouverProposition(id);
	if (!proposition) throw new Error('Proposition déjà traitée ou introuvable.');
	db().prepare('delete from drawing_submissions where id = ?').run(id);
	await unlink(join(DOSSIER_PRIVE, proposition.filename)).catch(() => {});
}
