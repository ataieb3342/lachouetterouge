import { crc32 } from 'node:zlib';

/**
 * Retire des images envoyées tout ce qui n'est pas l'image elle-même.
 *
 * Une photo prise au téléphone emporte, dans le fichier, la position GPS de
 * l'endroit où elle a été prise, la date et l'heure à la seconde, le modèle de
 * l'appareil, parfois le nom de son propriétaire ou une miniature de l'image
 * d'avant le recadrage. Servie telle quelle, n'importe quel visiteur les lit en
 * deux clics : la photo d'une réunion prise chez quelqu'un donne son adresse.
 *
 * Le principe : une liste fermée de ce qui sert à afficher l'image (pixels,
 * palette, profil de couleur, animation), et tout le reste part, y compris ce
 * qu'on ne connaît pas. Une liste de ce qu'il faut retirer laisserait passer le
 * prochain format de métadonnées inventé par un fabricant.
 *
 * Une exception : l'orientation. Un téléphone tenu en portrait enregistre
 * souvent l'image couchée, et note dans l'EXIF qu'il faut la redresser. Sans
 * cette note, la photo s'afficherait couchée : l'EXIF est donc remplacé, à la
 * même place, par un EXIF qui ne contient qu'elle.
 *
 * Aucun fichier n'est enregistré à moitié nettoyé : soit sa structure entière
 * est comprise et il est réécrit, soit il est refusé (`ImageIllisible`).
 *
 * Aucune dépendance : les formats sont lus octet par octet, ici.
 */

export type Nettoyage = {
	/** Le fichier réécrit, prêt à être enregistré. */
	octets: Buffer;
	/** Ce qui a été retiré, en clair (« EXIF », « XMP »…), pour les comptes rendus. */
	retire: string[];
	/** Le fichier contenait une position GPS. */
	position: boolean;
};

const MESSAGE_ILLISIBLE =
	"Image illisible : le fichier semble abîmé ou incomplet. Ouvrez-le et réenregistrez-le (ou faites-en une capture d'écran), puis réessayez.";

/**
 * Levée pour tout fichier dont la structure n'est pas entièrement comprise.
 * Le message s'adresse à la personne qui envoie l'image ; `detail` dit, à qui
 * maintient le site, où la lecture s'est arrêtée.
 */
export class ImageIllisible extends Error {
	detail: string;
	constructor(detail: string) {
		super(MESSAGE_ILLISIBLE);
		this.detail = detail;
	}
}

function illisible(detail: string): never {
	throw new ImageIllisible(detail);
}

type Bilan = { retire: Set<string>; position: boolean };

const NETTOYEURS: Record<string, (src: Buffer, bilan: Bilan) => Buffer> = {
	'image/jpeg': jpeg,
	'image/png': png,
	'image/webp': webp,
	'image/gif': gif,
	'image/avif': avif
};

/**
 * `mime` est le type lu dans les premiers octets par `sniffImage` : chaque
 * format vérifie de toute façon sa propre signature.
 */
export function retirerMetadonnees(octets: Buffer, mime: string): Nettoyage {
	const nettoyeur = NETTOYEURS[mime];
	if (!nettoyeur) illisible(`type non pris en charge : ${mime}`);
	const bilan: Bilan = { retire: new Set(), position: false };
	const propre = nettoyeur(octets, bilan);
	return { octets: propre, retire: [...bilan.retire], position: bilan.position };
}

const APRES_LA_FIN = 'données placées après l’image';
const AUTRES = 'autres blocs';

/** Note ce qui est retiré. Le XMP est du texte : on y cherche la position. */
function noter(bilan: Bilan, nom: string, donnees: Buffer) {
	bilan.retire.add(nom);
	if (donnees.includes('GPSLatitude') || donnees.includes('GPSLongitude')) bilan.position = true;
}

function commencePar(octets: Buffer, texte: string): boolean {
	return octets.length >= texte.length && octets.toString('latin1', 0, texte.length) === texte;
}

/* ------------------------------------------------------------------ EXIF */

/**
 * Lit, dans une structure TIFF (le cœur de l'EXIF), l'orientation et la
 * présence d'une position GPS. Ce qui ne se lit pas proprement compte comme
 * « pas d'orientation » : c'est aussi ce que fait le navigateur. L'EXIF est
 * jeté de toute façon, il n'y a donc pas lieu de refuser l'image pour lui.
 */
function lireExif(tiff: Buffer): { orientation: number; position: boolean } {
	const lu = { orientation: 1, position: false };
	if (tiff.length < 8) return lu;
	const ordre = tiff.toString('latin1', 0, 2);
	if (ordre !== 'II' && ordre !== 'MM') return lu;
	const u16 = (p: number) => (ordre === 'II' ? tiff.readUInt16LE(p) : tiff.readUInt16BE(p));
	const u32 = (p: number) => (ordre === 'II' ? tiff.readUInt32LE(p) : tiff.readUInt32BE(p));
	if (u16(2) !== 42) return lu;

	/** Les entrées d'un répertoire : [balise, type, nombre de valeurs, position de la valeur]. */
	const repertoire = (debut: number): number[][] => {
		const entrees: number[][] = [];
		if (debut < 8 || debut + 2 > tiff.length) return entrees;
		for (let i = 0, n = u16(debut); i < n; i++) {
			const e = debut + 2 + 12 * i;
			if (e + 12 > tiff.length) break;
			entrees.push([u16(e), u16(e + 2), u32(e + 4), e + 8]);
		}
		return entrees;
	};

	for (const [balise, type, nombre, valeur] of repertoire(u32(4))) {
		// Le navigateur n'applique l'orientation que sous cette forme exacte :
		// un seul entier court, de 1 à 8.
		if (balise === 0x0112 && type === 3 && nombre === 1) {
			const v = u16(valeur);
			if (v >= 1 && v <= 8) lu.orientation = v;
		}
		// 0x8825 renvoie au répertoire GPS, où 2 et 4 sont la latitude et la longitude.
		if (balise === 0x8825 && repertoire(u32(valeur)).some(([b]) => b === 2 || b === 4)) {
			lu.position = true;
		}
	}
	return lu;
}

/**
 * Une structure TIFF qui ne contient que l'orientation : 26 octets, rien
 * d'autre à lire.
 */
function tiffOrientation(orientation: number): Buffer {
	const t = Buffer.alloc(26);
	t.write('MM', 0, 'latin1'); // ordre des octets : le plus fort d'abord
	t.writeUInt16BE(42, 2);
	t.writeUInt32BE(8, 4); // le répertoire suit l'en-tête
	t.writeUInt16BE(1, 8); // une seule entrée…
	t.writeUInt16BE(0x0112, 10); // … l'orientation,
	t.writeUInt16BE(3, 12); // un entier court,
	t.writeUInt32BE(1, 14); // une seule valeur
	t.writeUInt16BE(orientation, 18);
	// Les quatre derniers octets restent à zéro : pas de second répertoire,
	// donc pas de miniature.
	return t;
}

/* ------------------------------------------------------------------ JPEG */

/*
 * Un JPEG est une suite de segments : FF, un octet qui dit lequel, la
 * longueur, le contenu. Après le segment SOS viennent les données compressées
 * de l'image, sans longueur : on les parcourt jusqu'au marqueur suivant. FF D9
 * marque la fin, et ce qui suit est jeté - c'est là que certains téléphones
 * accrochent une vidéo de quelques secondes (« photo animée ») ou une seconde
 * image.
 *
 * Gardés : les segments qui décrivent l'image (tables, cadre, balayages),
 * JFIF sans sa miniature, le profil de couleur (APP2 ICC_PROFILE) et le
 * segment Adobe (APP14), qui dit comment lire les couleurs. Le reste part :
 * APP1 (EXIF, XMP), APP13 (IPTC), les autres APPn, les commentaires.
 */
const EXIF_JPEG = Buffer.from('Exif\0\0', 'latin1');

/** SOF0 à SOF15 : le cadre de l'image (dimensions, composantes). C4, C8 et CC n'en sont pas. */
function estCadre(m: number): boolean {
	return m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
}

/** Les segments qui servent à décoder : cadres, tables (C4, CC, DB), balayage (DA) et suivants. */
function decritImage(m: number): boolean {
	return (m >= 0xc0 && m <= 0xcf && m !== 0xc8) || (m >= 0xda && m <= 0xdf);
}

function segmentJpeg(marqueur: number, donnees: Buffer): Buffer {
	const entete = Buffer.from([0xff, marqueur, 0, 0]);
	entete.writeUInt16BE(donnees.length + 2, 2);
	return Buffer.concat([entete, donnees]);
}

function jpeg(src: Buffer, bilan: Bilan): Buffer {
	if (src.length < 4 || src[0] !== 0xff || src[1] !== 0xd8) illisible('JPEG : début absent');
	const sortie: Buffer[] = [src.subarray(0, 2)];
	let pos = 2;
	let cadre = false;
	let balayage = false;
	let exifLu = false;

	for (;;) {
		if (src[pos] !== 0xff) illisible('JPEG : marqueur attendu');
		while (src[pos] === 0xff) pos++; // octets de remplissage
		if (pos >= src.length) illisible('JPEG : fin absente');
		const marqueur = src[pos++];

		if (marqueur === 0xd9) {
			if (!balayage) illisible('JPEG : aucune image');
			sortie.push(Buffer.from([0xff, 0xd9]));
			if (pos < src.length) bilan.retire.add(APRES_LA_FIN);
			return Buffer.concat(sortie);
		}
		// Ceux-là n'ont pas de longueur, et rien à faire hors des données compressées.
		if (marqueur === 0x00 || marqueur === 0x01 || (marqueur >= 0xd0 && marqueur <= 0xd8)) {
			illisible('JPEG : marqueur inattendu');
		}
		if (pos + 2 > src.length) illisible('JPEG : segment tronqué');
		const longueur = src.readUInt16BE(pos);
		if (longueur < 2 || pos + longueur > src.length) illisible('JPEG : segment tronqué');
		const segment = src.subarray(pos - 2, pos + longueur);
		const donnees = src.subarray(pos + 2, pos + longueur);
		pos += longueur;

		if (decritImage(marqueur)) {
			if (estCadre(marqueur)) cadre = true;
			if (marqueur === 0xda && !cadre) illisible('JPEG : données avant le cadre');
			sortie.push(segment);
			if (marqueur !== 0xda) continue;

			// Les données compressées. FF n'y apparaît que suivi de 00 (un FF
			// ordinaire), de D0 à D7 (points de reprise), d'un autre FF
			// (remplissage) ou du marqueur qui les termine.
			balayage = true;
			const debut = pos;
			for (;;) {
				pos = src.indexOf(0xff, pos);
				if (pos < 0 || pos + 1 >= src.length) illisible('JPEG : image tronquée');
				const suivant = src[pos + 1];
				if (suivant === 0x00 || (suivant >= 0xd0 && suivant <= 0xd7)) pos += 2;
				else if (suivant === 0xff) pos += 1;
				else break;
			}
			sortie.push(src.subarray(debut, pos));
		} else if (marqueur === 0xe0 && commencePar(donnees, 'JFIF\0') && donnees.length >= 14) {
			// JFIF : la densité de l'image, puis une miniature facultative, retirée.
			const jfif = Buffer.from(segment.subarray(0, 18));
			jfif.writeUInt16BE(16, 2);
			jfif[16] = 0;
			jfif[17] = 0;
			if (donnees.length > 14) bilan.retire.add('miniature');
			sortie.push(jfif);
		} else if (marqueur === 0xe1 && commencePar(donnees, 'Exif\0')) {
			bilan.retire.add('EXIF');
			// Le navigateur ne lit que le premier EXIF : on fait de même.
			if (exifLu) continue;
			exifLu = true;
			const exif = lireExif(donnees.subarray(6));
			if (exif.position) bilan.position = true;
			if (exif.orientation !== 1) {
				sortie.push(segmentJpeg(0xe1, Buffer.concat([EXIF_JPEG, tiffOrientation(exif.orientation)])));
			}
		} else if (marqueur === 0xe2 && commencePar(donnees, 'ICC_PROFILE\0')) {
			sortie.push(segment);
		} else if (marqueur === 0xee && commencePar(donnees, 'Adobe') && donnees.length >= 12) {
			// Douze octets suffisent : nom, version, deux drapeaux, transformation des couleurs.
			sortie.push(segmentJpeg(0xee, donnees.subarray(0, 12)));
		} else {
			noter(bilan, nomSegmentJpeg(marqueur, donnees), donnees);
		}
	}
}

function nomSegmentJpeg(marqueur: number, donnees: Buffer): string {
	if (marqueur === 0xe1 && commencePar(donnees, 'http://ns.adobe.com/x')) return 'XMP';
	if (marqueur === 0xe2 && commencePar(donnees, 'MPF\0')) return 'images jointes';
	if (marqueur === 0xe0 && commencePar(donnees, 'JFXX\0')) return 'miniature';
	if (marqueur === 0xed) return 'IPTC';
	if (marqueur === 0xfe) return 'commentaires';
	return AUTRES;
}

/* ------------------------------------------------------------------- PNG */

/*
 * Un PNG est une suite de blocs : longueur, nom en quatre lettres, contenu,
 * somme de contrôle. On garde ceux qui servent à dessiner l'image, et l'on
 * jette les autres, dont eXIf (EXIF), tEXt, zTXt et iTXt (textes libres, XMP
 * compris) et tIME (date de modification).
 */
const SIGNATURE_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const BLOCS_PNG = new Set([
	...['IHDR', 'PLTE', 'IDAT', 'IEND'], // l'image
	...['tRNS', 'bKGD', 'sBIT', 'hIST', 'pHYs'], // transparence, fond, précision, taille d'impression
	...['cHRM', 'gAMA', 'iCCP', 'sRGB', 'cICP', 'mDCV', 'cLLI'], // couleurs
	...['acTL', 'fcTL', 'fdAT'] // animation
]);

function blocPng(nom: string, donnees: Buffer): Buffer {
	const bloc = Buffer.alloc(12 + donnees.length);
	bloc.writeUInt32BE(donnees.length, 0);
	bloc.write(nom, 4, 'latin1');
	donnees.copy(bloc, 8);
	bloc.writeUInt32BE(crc32(bloc.subarray(4, 8 + donnees.length)), 8 + donnees.length);
	return bloc;
}

function png(src: Buffer, bilan: Bilan): Buffer {
	if (!src.subarray(0, 8).equals(SIGNATURE_PNG)) illisible('PNG : signature absente');
	const sortie: Buffer[] = [SIGNATURE_PNG];
	let pos = 8;
	let image = false;
	let exifLu = false;

	for (;;) {
		if (pos + 12 > src.length) illisible('PNG : bloc tronqué');
		const longueur = src.readUInt32BE(pos);
		const fin = pos + 12 + longueur;
		if (fin > src.length) illisible('PNG : bloc tronqué');
		const nom = src.toString('latin1', pos + 4, pos + 8);
		if (!/^[A-Za-z]{4}$/.test(nom)) illisible('PNG : nom de bloc invalide');
		if (crc32(src.subarray(pos + 4, fin - 4)) !== src.readUInt32BE(fin - 4)) {
			illisible(`PNG : somme de contrôle fausse (${nom})`);
		}
		if (pos === 8 && nom !== 'IHDR') illisible('PNG : IHDR absent');
		const bloc = src.subarray(pos, fin);
		const donnees = src.subarray(pos + 8, fin - 4);
		pos = fin;

		if (nom === 'IEND') {
			if (!image) illisible('PNG : aucune image');
			sortie.push(bloc);
			if (pos < src.length) bilan.retire.add(APRES_LA_FIN);
			return Buffer.concat(sortie);
		}
		if (BLOCS_PNG.has(nom)) {
			if (nom === 'IDAT') image = true;
			sortie.push(bloc);
		} else if (nom === 'eXIf') {
			bilan.retire.add('EXIF');
			if (exifLu) continue;
			exifLu = true;
			const exif = lireExif(donnees);
			if (exif.position) bilan.position = true;
			if (exif.orientation !== 1) sortie.push(blocPng('eXIf', tiffOrientation(exif.orientation)));
		} else {
			const nomLisible = nom === 'tIME' ? 'date' : ['tEXt', 'zTXt', 'iTXt'].includes(nom) ? 'textes' : AUTRES;
			noter(bilan, nomLisible, donnees);
		}
	}
}

/* ------------------------------------------------------------------ WebP */

/*
 * Un WebP est un conteneur RIFF : « RIFF », la taille, « WEBP », puis des
 * blocs (nom en quatre lettres, taille, contenu, un octet de bourrage si la
 * taille est impaire). Le format étendu s'ouvre sur un bloc VP8X, dont les
 * drapeaux annoncent la présence d'EXIF et de XMP : ils doivent suivre ce
 * qu'on retire, et la taille totale aussi, sans quoi des lecteurs refusent le
 * fichier.
 *
 * Chrome ignore l'orientation EXIF d'un WebP, Safari l'applique. Elle est
 * gardée telle quelle : chaque navigateur affiche le fichier nettoyé comme il
 * affichait l'original - vérifié dans les deux le 23 octobre 2026.
 */
const BLOCS_WEBP = new Set(['VP8X', 'ICCP', 'ANIM', 'ANMF', 'ALPH', 'VP8 ', 'VP8L']);
const DRAPEAU_EXIF = 0x08;
const DRAPEAU_XMP = 0x04;

function blocWebp(nom: string, donnees: Buffer): Buffer {
	const bloc = Buffer.alloc(8 + donnees.length + (donnees.length % 2));
	bloc.write(nom, 0, 'latin1');
	bloc.writeUInt32LE(donnees.length, 4);
	donnees.copy(bloc, 8);
	return bloc;
}

function webp(src: Buffer, bilan: Bilan): Buffer {
	if (src.length < 20 || !commencePar(src, 'RIFF') || src.toString('latin1', 8, 12) !== 'WEBP') {
		illisible('WebP : en-tête absent');
	}
	const fin = 8 + src.readUInt32LE(4);
	if (fin > src.length) illisible('WebP : fichier tronqué');
	if (fin < src.length) bilan.retire.add(APRES_LA_FIN);

	const blocs: Buffer[] = [];
	let pos = 12;
	let etendu = false;
	let image = false;
	let exifLu = false;
	let exifGarde = false;

	while (pos < fin) {
		if (pos + 8 > fin) illisible('WebP : bloc tronqué');
		const nom = src.toString('latin1', pos, pos + 4);
		const taille = src.readUInt32LE(pos + 4);
		const suivant = pos + 8 + taille + (taille % 2);
		if (suivant > fin) illisible('WebP : bloc tronqué');
		const bloc = src.subarray(pos, suivant);
		const donnees = src.subarray(pos + 8, pos + 8 + taille);
		const premier = pos === 12;
		pos = suivant;

		if (premier) {
			if (nom === 'VP8X') {
				if (taille < 10) illisible('WebP : VP8X trop court');
				etendu = true;
			} else if (nom !== 'VP8 ' && nom !== 'VP8L') {
				illisible('WebP : premier bloc inattendu');
			}
		} else if (nom === 'VP8X') {
			illisible('WebP : VP8X en double');
		}

		// Le format simple ne contient qu'un bloc d'image : ce qui le suit est en trop.
		if (BLOCS_WEBP.has(nom) && (etendu || premier)) {
			if (nom === 'VP8 ' || nom === 'VP8L' || nom === 'ANMF') image = true;
			blocs.push(bloc);
		} else if (nom === 'EXIF' && etendu) {
			bilan.retire.add('EXIF');
			if (exifLu) continue;
			exifLu = true;
			// La norme veut la structure TIFF seule ; certains logiciels la font
			// précéder de « Exif », comme dans un JPEG. On garde la forme reçue.
			const prefixe = commencePar(donnees, 'Exif\0\0') ? EXIF_JPEG : Buffer.alloc(0);
			const exif = lireExif(donnees.subarray(prefixe.length));
			if (exif.position) bilan.position = true;
			if (exif.orientation !== 1) {
				blocs.push(blocWebp('EXIF', Buffer.concat([prefixe, tiffOrientation(exif.orientation)])));
				exifGarde = true;
			}
		} else {
			noter(bilan, nom === 'XMP ' ? 'XMP' : nom === 'EXIF' ? 'EXIF' : AUTRES, donnees);
		}
	}
	if (!image) illisible('WebP : aucune image');

	if (etendu) {
		const vp8x = Buffer.from(blocs[0]);
		vp8x[8] = (vp8x[8] & ~(DRAPEAU_EXIF | DRAPEAU_XMP)) | (exifGarde ? DRAPEAU_EXIF : 0);
		blocs[0] = vp8x;
	}
	const entete = Buffer.alloc(12);
	entete.write('RIFF', 0, 'latin1');
	entete.writeUInt32LE(4 + blocs.reduce((total, b) => total + b.length, 0), 4);
	entete.write('WEBP', 8, 'latin1');
	return Buffer.concat([entete, ...blocs]);
}

/* ------------------------------------------------------------------- GIF */

/*
 * Un GIF : un en-tête, une palette, puis des blocs - images, extensions,
 * et l'octet 3B qui termine. Les extensions sont faites de « sous-blocs »
 * (un octet de longueur, puis le contenu) terminés par un sous-bloc vide.
 * Gardés : les images, le contrôle de l'animation (F9), le texte dessiné
 * dans l'image (01) et l'extension qui fait boucler l'animation. Retirés :
 * les commentaires (FE) et les autres extensions d'application, dont le XMP.
 */
const BOUCLE_GIF = ['NETSCAPE2.0', 'ANIMEXTS1.0'];

/** Saute une suite de sous-blocs et renvoie la position qui la suit. */
function sousBlocs(src: Buffer, pos: number): number {
	for (;;) {
		if (pos >= src.length) illisible('GIF : bloc tronqué');
		const longueur = src[pos];
		pos += 1 + longueur;
		if (longueur === 0) return pos;
	}
}

function tailleTableGif(drapeaux: number): number {
	return drapeaux & 0x80 ? 3 << ((drapeaux & 7) + 1) : 0;
}

function gif(src: Buffer, bilan: Bilan): Buffer {
	if (src.length < 13 || !(commencePar(src, 'GIF87a') || commencePar(src, 'GIF89a'))) {
		illisible('GIF : en-tête absent');
	}
	let pos = 13 + tailleTableGif(src[10]);
	if (pos > src.length) illisible('GIF : palette tronquée');
	const sortie: Buffer[] = [src.subarray(0, pos)];
	let image = false;

	for (;;) {
		if (pos >= src.length) illisible('GIF : fin absente');
		const debut = pos;
		const type = src[pos];

		if (type === 0x3b) {
			if (!image) illisible('GIF : aucune image');
			sortie.push(src.subarray(pos, pos + 1));
			if (pos + 1 < src.length) bilan.retire.add(APRES_LA_FIN);
			return Buffer.concat(sortie);
		}
		if (type === 0x2c) {
			// Position, taille, drapeaux, palette locale, puis l'image compressée.
			if (pos + 10 > src.length) illisible('GIF : image tronquée');
			pos += 10 + tailleTableGif(src[pos + 9]) + 1;
			pos = sousBlocs(src, pos);
			sortie.push(src.subarray(debut, pos));
			image = true;
		} else if (type === 0x21) {
			if (pos + 2 > src.length) illisible('GIF : extension tronquée');
			const etiquette = src[pos + 1];
			pos = sousBlocs(src, pos + 2);
			const extension = src.subarray(debut, pos);
			const application = etiquette === 0xff ? src.toString('latin1', debut + 3, debut + 14) : '';
			if (etiquette === 0xf9 || etiquette === 0x01 || BOUCLE_GIF.includes(application)) {
				sortie.push(extension);
			} else {
				const nom = etiquette === 0xfe ? 'commentaires' : application.startsWith('XMP Data') ? 'XMP' : AUTRES;
				noter(bilan, nom, extension);
			}
		} else {
			illisible('GIF : bloc inconnu');
		}
	}
}

/* ------------------------------------------------------------------ AVIF */

/*
 * Un AVIF est fait de « boîtes » imbriquées : taille, nom en quatre lettres,
 * contenu. Les métadonnées n'y sont pas des boîtes à part, mais des
 * « éléments » déclarés dans la boîte meta (iinf) - un élément Exif, un
 * élément mime pour le XMP - dont le contenu est rangé ailleurs, à une
 * position notée dans la boîte iloc.
 *
 * Retirer ces octets décalerait tout ce qui les suit et fausserait chaque
 * position notée dans iloc. On les remplace donc par des zéros, sur place : le
 * fichier garde sa taille et sa structure, et il n'y reste rien à lire. Les
 * boîtes de premier niveau qu'on ne connaît pas deviennent, pour la même
 * raison, des boîtes « free » : de l'espace vide, que tout lecteur saute.
 *
 * L'orientation d'un AVIF n'est pas dans son EXIF, mais dans des propriétés
 * de l'image (irot, imir), qui ne sont pas touchées.
 */
type Boite = { nom: string; debut: number; contenu: number; fin: number };

const BOITES_AVIF = new Set(['ftyp', 'meta', 'mdat', 'moov', 'free', 'skip']);

function boites(src: Buffer, debut: number, fin: number): Boite[] {
	const liste: Boite[] = [];
	for (let pos = debut; pos < fin; ) {
		if (pos + 8 > fin) illisible('AVIF : boîte tronquée');
		let taille = src.readUInt32BE(pos);
		let entete = 8;
		if (taille === 1) {
			// La taille ne tient pas sur 32 bits : elle suit, sur 64.
			if (pos + 16 > fin) illisible('AVIF : boîte tronquée');
			taille = Number(src.readBigUInt64BE(pos + 8));
			entete = 16;
		} else if (taille === 0) {
			taille = fin - pos; // jusqu'à la fin
		}
		if (taille < entete || pos + taille > fin) illisible('AVIF : boîte tronquée');
		liste.push({ nom: src.toString('latin1', pos + 4, pos + 8), debut: pos, contenu: pos + entete, fin: pos + taille });
		pos += taille;
	}
	return liste;
}

/** Lit les champs d'une boîte les uns après les autres, sans jamais en sortir. */
function lecteur(src: Buffer, b: Boite) {
	let pos = b.contenu;
	const lire = (octets: number): number => {
		if (pos + octets > b.fin) illisible(`AVIF : ${b.nom} tronquée`);
		const valeur =
			octets === 0 ? 0
			: octets <= 6 ? src.readUIntBE(pos, octets)
			: octets === 8 ? Number(src.readBigUInt64BE(pos))
			: illisible(`AVIF : champ de ${octets} octets dans ${b.nom}`);
		pos += octets;
		return valeur;
	};
	return { lire, position: () => pos };
}

/** Fait d'une boîte un espace vide, sans changer sa taille. */
function vider(sortie: Buffer, b: Boite, bilan: Bilan) {
	noter(bilan, AUTRES, sortie.subarray(b.contenu, b.fin));
	sortie.write('free', b.debut + 4, 'latin1');
	sortie.fill(0, b.contenu, b.fin);
}

function avif(src: Buffer, bilan: Bilan): Buffer {
	const sortie = Buffer.from(src); // une copie : on efface sur place
	const haut = boites(src, 0, src.length);
	if (haut[0]?.nom !== 'ftyp') illisible('AVIF : ftyp absente');
	let image = false;
	for (const b of haut) {
		if (b.nom === 'meta') {
			elementsAvif(src, sortie, b, bilan);
			image = true;
		} else if (b.nom === 'moov') {
			pistesAvif(src, sortie, b, bilan);
			image = true;
		} else if (!BOITES_AVIF.has(b.nom)) {
			vider(sortie, b, bilan);
		}
	}
	if (!image) illisible('AVIF : aucune image');
	return sortie;
}

/** Efface le contenu des éléments Exif, mime (XMP) et uri d'une boîte meta. */
function elementsAvif(src: Buffer, sortie: Buffer, meta: Boite, bilan: Bilan) {
	// meta, iinf, infe et iloc commencent par 4 octets : version et drapeaux.
	const enfants = boites(src, meta.contenu + 4, meta.fin);
	const iinf = enfants.find((b) => b.nom === 'iinf');
	const iloc = enfants.find((b) => b.nom === 'iloc');
	const idat = enfants.find((b) => b.nom === 'idat');
	if (!iinf || !iloc) illisible('AVIF : inventaire absent');

	// Quels éléments sont des métadonnées : numéro → type.
	const aEffacer = new Map<number, string>();
	const li = lecteur(src, iinf);
	const versionIinf = li.lire(1);
	li.lire(3);
	li.lire(versionIinf === 0 ? 2 : 4); // nombre d'éléments
	for (const infe of boites(src, li.position(), iinf.fin)) {
		if (infe.nom !== 'infe') continue;
		const le = lecteur(src, infe);
		const version = le.lire(1);
		le.lire(3);
		if (version < 2) illisible('AVIF : infe trop ancienne');
		const numero = le.lire(version === 2 ? 2 : 4);
		le.lire(2); // protection
		const p = le.position();
		le.lire(4);
		const type = src.toString('latin1', p, p + 4);
		if (type === 'Exif' || type === 'mime' || type === 'uri ') aEffacer.set(numero, type);
	}

	// Où sont rangés leurs octets.
	const lo = lecteur(src, iloc);
	const version = lo.lire(1);
	lo.lire(3);
	if (version > 2) illisible('AVIF : iloc inconnue');
	const tailles = lo.lire(1);
	const tailles2 = lo.lire(1);
	const tailleDecalage = tailles >> 4;
	const tailleLongueur = tailles & 15;
	const tailleBase = tailles2 >> 4;
	const tailleIndex = version > 0 ? tailles2 & 15 : 0;
	const nombre = lo.lire(version < 2 ? 2 : 4);

	for (let i = 0; i < nombre; i++) {
		const numero = lo.lire(version < 2 ? 2 : 4);
		const methode = version > 0 ? lo.lire(2) & 15 : 0;
		const reference = lo.lire(2);
		const base = lo.lire(tailleBase);
		const morceaux = lo.lire(2);
		for (let j = 0; j < morceaux; j++) {
			lo.lire(tailleIndex);
			const decalage = lo.lire(tailleDecalage);
			const longueur = lo.lire(tailleLongueur);
			const type = aEffacer.get(numero);
			if (!type) continue;

			// Méthode 0 : position dans le fichier ; 1 : dans la boîte idat. Les
			// autres cas (fichier externe, renvoi vers un autre élément,
			// longueur non dite) ne se rencontrent pas dans une photo : refusés
			// plutôt que laissés en place.
			if (reference !== 0 || longueur === 0 || methode > 1 || (methode === 1 && !idat)) {
				illisible('AVIF : métadonnées introuvables');
			}
			const zone = methode === 0 ? { contenu: 0, fin: src.length } : idat!;
			const debut = zone.contenu + base + decalage;
			const fin = debut + longueur;
			if (fin > zone.fin) illisible('AVIF : métadonnées hors du fichier');

			const contenu = src.subarray(debut, fin);
			if (type === 'Exif' && contenu.length >= 4) {
				// Quatre octets disent où commence la structure TIFF.
				if (lireExif(contenu.subarray(4 + contenu.readUInt32BE(0))).position) bilan.position = true;
			}
			noter(bilan, type === 'Exif' ? 'EXIF' : contenu.includes('xmpmeta') ? 'XMP' : AUTRES, contenu);
			sortie.fill(0, debut, fin);
		}
	}
}

/**
 * Image animée (AVIS) : construite comme une vidéo, avec ses boîtes de
 * description (udta, meta) et des dates de création dans les en-têtes.
 */
function pistesAvif(src: Buffer, sortie: Buffer, parent: Boite, bilan: Bilan) {
	for (const b of boites(src, parent.contenu, parent.fin)) {
		if (b.nom === 'udta' || b.nom === 'meta') {
			vider(sortie, b, bilan);
		} else if (b.nom === 'mvhd' || b.nom === 'tkhd' || b.nom === 'mdhd') {
			// Version et drapeaux, puis les dates de création et de modification.
			const taille = src[b.contenu] === 1 ? 16 : 8;
			if (b.contenu + 4 + taille > b.fin) illisible(`AVIF : ${b.nom} tronquée`);
			if (src.subarray(b.contenu + 4, b.contenu + 4 + taille).some((o) => o !== 0)) bilan.retire.add('date');
			sortie.fill(0, b.contenu + 4, b.contenu + 4 + taille);
		} else if (b.nom === 'trak' || b.nom === 'mdia') {
			pistesAvif(src, sortie, b, bilan);
		}
	}
}
