import { mkdir, writeFile, unlink, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fromBuffer, type Entry } from 'yauzl';
import mammoth from 'mammoth';
import TurndownService from 'turndown';
import { db, now } from './db.ts';
import { UPLOADS_DIR } from './media.ts';

/**
 * Les comptes rendus de réunion, réservés à l'équipe (Administration →
 * Comptes rendus de réunions).
 *
 * **Ils ne sont jamais publics** : pas de route hors de `/admin`, rien dans
 * le flux RSS ni dans le plan du site. Le fichier d'origine (un document
 * Word ou Markdown) est gardé dans un dossier à part, sous un nom au hasard,
 * sans ligne dans la table `media` - la route `/media/…` ne peut donc pas le
 * servir.
 *
 * Un document Word est une archive ZIP : avant de la confier à `mammoth`, qui
 * la convertit, `verifierDocx` en contrôle la taille réelle une fois
 * décompressée. Sans cela, un fichier de quelques kilo-octets peut en
 * contenir des gigaoctets et saturer la mémoire du serveur.
 *
 * La table et ses colonnes sont en anglais (`meeting_reports`) : elles sont
 * parties en production ainsi, et une migration ne se réécrit pas.
 */

const DOSSIER_PRIVE = join(UPLOADS_DIR, '.meeting-reports');

const MO = 1024 * 1024;
/** Longueur maximale du texte d'un compte rendu, en caractères. */
const TEXTE_MAX = 200_000;
/** Taille maximale du fichier envoyé. */
const FICHIER_MAX = 10 * MO;
/** Limites d'une archive Word une fois décompressée. */
const ARCHIVE = { entrees: 1000, parEntree: 10 * MO, total: 25 * MO };

export type CompteRendu = {
	id: number;
	title: string;
	meeting_date: string;
	body: string;
	filename: string | null;
	original_name: string;
	mime: string;
	created_at: string;
	updated_at: string;
	created_by: number | null;
};

export type ResumeCompteRendu = Pick<CompteRendu, 'id' | 'title' | 'meeting_date' | 'updated_at'>;

export type ChampsCompteRendu = { title: string; date: string; body: string };

/** Ce que donne un fichier importé : le texte converti, et le fichier lui-même à conserver. */
export type FichierImporte = { bytes: Buffer; body: string; mime: string; name: string; extension: string };

/** Les comptes rendus, du plus récent au plus ancien, filtrés sur le titre et le texte. */
export function listerComptesRendus(recherche = ''): ResumeCompteRendu[] {
	// `%` et `_` sont des jokers pour `like` : tapés par l'utilisateur, ils
	// doivent être cherchés tels quels.
	const motif = `%${recherche.replace(/[\\%_]/g, '\\$&')}%`;
	return db()
		.prepare(
			`select id, title, meeting_date, updated_at
			   from meeting_reports
			  where title like ? escape '\\' or body like ? escape '\\'
			  order by meeting_date desc, id desc
			  limit 200`
		)
		.all(motif, motif) as ResumeCompteRendu[];
}

export function trouverCompteRendu(id: number): CompteRendu | undefined {
	if (!Number.isSafeInteger(id) || id <= 0) return undefined;
	return db().prepare('select * from meeting_reports where id = ?').get(id) as CompteRendu | undefined;
}

/** Lit et valide le formulaire : titre, date de la réunion, texte. */
export function lireChampsCompteRendu(form: FormData): ChampsCompteRendu {
	const title = String(form.get('title') ?? '').trim();
	const date = String(form.get('meetingDate') ?? '');
	const body = String(form.get('body') ?? '').trim();

	if (!title || title.length > 200) throw new Error('Indiquez un titre de 200 caractères maximum.');
	// Le format seul ne suffit pas : « 2026-02-31 » le respecte. On vérifie que
	// la date existe en la relisant.
	const dateValide =
		/^\d{4}-\d{2}-\d{2}$/.test(date) &&
		Number.isFinite(Date.parse(date)) &&
		new Date(date).toISOString().slice(0, 10) === date;
	if (!dateValide) throw new Error('Indiquez une date de réunion valide.');
	if (body.length > TEXTE_MAX) throw new Error('Le texte dépasse 200 000 caractères.');

	return { title, date, body };
}

/**
 * Parcourt l'archive d'un document Word sans rien en garder, pour vérifier
 * qu'elle est bien ce qu'elle prétend : peu d'entrées, une taille décompressée
 * raisonnable (mesurée, pas seulement déclarée), ni chiffrement ni macros, et
 * les deux fichiers que contient tout `.docx`.
 */
async function verifierDocx(octets: Buffer): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		fromBuffer(octets, { lazyEntries: true, validateEntrySizes: true }, (erreur, zip) => {
			if (erreur || !zip) return reject(new Error('Document Word illisible. Utilisez un fichier .docx.'));

			let entrees = 0;
			let tailleDeclaree = 0;
			let tailleLue = 0;
			let arrete = false;
			const noms = new Set<string>();

			const arreter = (cause: Error) => {
				if (arrete) return;
				arrete = true;
				zip.close();
				reject(cause);
			};

			zip.on('error', arreter);
			zip.on('entry', (entree: Entry) => {
				entrees += 1;
				tailleDeclaree += entree.uncompressedSize;
				const chiffree = (entree.generalPurposeBitFlag & 1) === 1;
				const macros = /vbaProject\.bin$/i.test(entree.fileName);
				if (
					entrees > ARCHIVE.entrees ||
					entree.uncompressedSize > ARCHIVE.parEntree ||
					tailleDeclaree > ARCHIVE.total ||
					chiffree ||
					macros
				) {
					return arreter(new Error('Document Word trop volumineux ou format non pris en charge.'));
				}

				noms.add(entree.fileName);
				if (entree.fileName.endsWith('/')) return zip.readEntry();

				// La taille déclarée peut mentir : on lit l'entrée et on compte.
				zip.openReadStream(entree, (echec, flux) => {
					if (echec || !flux) return arreter(echec ?? new Error('Archive illisible.'));
					flux.on('error', arreter);
					flux.on('data', (morceau: Buffer) => {
						tailleLue += morceau.length;
						if (tailleLue > ARCHIVE.total) {
							flux.destroy();
							arreter(new Error('Document Word trop volumineux.'));
						}
					});
					flux.on('end', () => {
						if (!arrete) zip.readEntry();
					});
				});
			});
			zip.on('end', () => {
				if (arrete) return;
				if (!noms.has('[Content_Types].xml') || !noms.has('word/document.xml')) {
					return arreter(new Error('Ce fichier n’est pas un document Word .docx.'));
				}
				resolve();
			});
			zip.readEntry();
		});
	});
}

/**
 * Convertit un fichier `.docx` ou `.md` en texte Markdown. Rien n'est
 * enregistré ici : la conversion sert d'abord à remplir l'éditeur, où la
 * personne relit le résultat avant de valider.
 */
export async function importerFichier(fichier: File): Promise<FichierImporte> {
	const bytes = Buffer.from(await fichier.arrayBuffer());
	if (!bytes.length || bytes.length > FICHIER_MAX) throw new Error('Choisissez un fichier de 10 Mo maximum.');

	// Le nom d'origine ne sert qu'à l'affichage : on en retire ce qui pourrait
	// désigner un autre dossier.
	const name = fichier.name.replace(/[\\/\x00-\x1f\x7f]/g, '').slice(0, 180);
	const extension = name.toLowerCase().split('.').pop() ?? '';

	let body: string;
	let mime: string;

	if (extension === 'md' || extension === 'markdown') {
		if (bytes.length > MO) throw new Error('Le fichier Markdown dépasse 1 Mo.');
		try {
			body = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
		} catch {
			throw new Error('Le fichier Markdown doit être encodé en UTF-8.');
		}
		if (body.includes('\0')) throw new Error('Ce fichier ne contient pas du texte Markdown.');
		mime = 'text/markdown; charset=utf-8';
	} else if (extension === 'docx') {
		await verifierDocx(bytes);
		// `externalFileAccess: false` : un document ne fait rien lire d'autre au
		// serveur. Les images ne sont pas reprises, seulement le texte.
		const html = await mammoth.convertToHtml(
			{ buffer: bytes },
			{ externalFileAccess: false, convertImage: mammoth.images.imgElement(async () => ({ src: '' })) }
		);
		const versMarkdown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });
		versMarkdown.remove('img');
		body = versMarkdown.turndown(html.value);
		mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
	} else {
		throw new Error('Formats acceptés : .docx ou .md.');
	}

	body = body.trim();
	if (!body || body.length > TEXTE_MAX) {
		throw new Error('Le document est vide ou dépasse 200 000 caractères de texte.');
	}
	return { bytes, body, mime, name, extension };
}

/** Crée le compte rendu et, s'il vient d'un fichier, range ce fichier à part. */
export async function creerCompteRendu(
	champs: ChampsCompteRendu,
	importe: FichierImporte | null,
	adminId: number
): Promise<number> {
	const body = importe?.body ?? champs.body;
	if (!body) throw new Error('Importez un document ou saisissez le compte rendu.');

	const nomFichier = importe ? `${randomUUID()}.${importe.extension}` : null;
	if (nomFichier && importe) {
		await mkdir(DOSSIER_PRIVE, { recursive: true });
		await writeFile(join(DOSSIER_PRIVE, nomFichier), importe.bytes, { flag: 'wx', mode: 0o600 });
	}

	try {
		const maintenant = now();
		const resultat = db()
			.prepare(
				`insert into meeting_reports
				 (title, meeting_date, body, filename, original_name, mime, created_at, updated_at, created_by)
				 values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.run(
				champs.title,
				champs.date,
				body,
				nomFichier,
				importe?.name ?? '',
				importe?.mime ?? '',
				maintenant,
				maintenant,
				adminId
			);
		return Number(resultat.lastInsertRowid);
	} catch (erreur) {
		// Pas de fichier orphelin si la base a refusé la ligne.
		if (nomFichier) await unlink(join(DOSSIER_PRIVE, nomFichier)).catch(() => {});
		throw erreur;
	}
}

/**
 * Enregistre une modification, à condition que personne n'ait modifié le
 * compte rendu entre-temps. `versionLue` est la date de dernière modification
 * que la page avait affichée : si elle ne correspond plus, deux personnes
 * écrivaient en même temps, et la seconde écraserait le travail de la première.
 */
export function modifierCompteRendu(id: number, champs: ChampsCompteRendu, versionLue: string) {
	if (!champs.body) throw new Error('Le compte rendu ne peut pas être vide.');

	// Toujours strictement après la version lue, même pour deux enregistrements
	// dans la même milliseconde : c'est cette date qui sert de numéro de version.
	const version = new Date(Math.max(Date.now(), Date.parse(versionLue) + 1)).toISOString();
	const resultat = db()
		.prepare(
			'update meeting_reports set title = ?, meeting_date = ?, body = ?, updated_at = ? where id = ? and updated_at = ?'
		)
		.run(champs.title, champs.date, champs.body, version, id, versionLue);

	if (!resultat.changes) {
		throw new Error(
			'Ce compte rendu a été modifié par une autre personne. Rechargez la page avant de recommencer.'
		);
	}
}

export async function supprimerCompteRendu(id: number) {
	const compteRendu = trouverCompteRendu(id);
	if (!compteRendu) throw new Error('Compte rendu introuvable.');
	db().prepare('delete from meeting_reports where id = ?').run(id);
	if (compteRendu.filename) await unlink(join(DOSSIER_PRIVE, compteRendu.filename)).catch(() => {});
}

/** Le fichier d'origine, tel qu'il a été importé. */
export function lireFichierOrigine(compteRendu: CompteRendu): Promise<Buffer> {
	if (!compteRendu.filename) throw new Error('Fichier introuvable.');
	return readFile(join(DOSSIER_PRIVE, compteRendu.filename));
}

export { rendreCompteRendu, cocherTache } from '../markdown-compte-rendu.ts';
