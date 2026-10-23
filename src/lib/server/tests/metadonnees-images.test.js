// @ts-nocheck - comme les jeux, ce fichier est vérifié par `node --test`, pas par `npm run check`.
/**
 * Tests du nettoyage des images (`metadonnees-images.ts`).
 *
 *     node --test src/lib/server/tests/*.test.js
 *
 * Chaque image est fabriquée ici, octet par octet, avec ce qu'y met un
 * téléphone : une position GPS (place de la Libération, à Dijon), la marque de
 * l'appareil, la date, du XMP, un commentaire. On vérifie que tout cela
 * disparaît, que l'orientation reste, et que l'image elle-même n'a pas bougé
 * d'un octet.
 *
 * Les vérifications sont faites par un code distinct de celui qu'on teste :
 * relire l'EXIF avec la fonction même qui l'a écrit ne prouverait rien. Quand
 * `djpeg` et `dwebp` (libjpeg et libwebp) sont installés, les images sont en
 * plus décodées pour de bon, et les pixels comparés.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateSync, inflateSync } from 'node:zlib';
import { ImageIllisible, retirerMetadonnees } from '../metadonnees-images.ts';
import { octetsImageDemo } from '../demo-image.ts';

/* ------------------------------------------------- ce que met un téléphone */

const MARQUE = 'MARQUE-DU-TELEPHONE';
const DATE = '2026:10:23 19:30:00';

/** Trois fractions : degrés, minutes, secondes. */
function rationnels(...valeurs) {
	const b = Buffer.alloc(8 * valeurs.length);
	valeurs.forEach(([n, d], i) => {
		b.writeUInt32LE(n, 8 * i);
		b.writeUInt32LE(d, 8 * i + 4);
	});
	return b;
}
const LATITUDE = rationnels([47, 1], [19, 1], [2160, 100]);
const LONGITUDE = rationnels([5, 1], [2, 1], [2700, 100]);

/**
 * Un EXIF de téléphone : marque, orientation, date, et un répertoire GPS.
 * Écrit petit-boutiste (« II »), comme le font la plupart des appareils.
 */
function exifDeTelephone(orientation) {
	const court = (v) => {
		const b = Buffer.alloc(4);
		b.writeUInt16LE(v);
		return b;
	};
	const ascii = (s) => Buffer.from(s + '\0', 'latin1');
	const ifd0 = [
		[0x010f, 2, MARQUE.length + 1, ascii(MARQUE)],
		[0x0112, 3, 1, court(orientation)],
		[0x0132, 2, DATE.length + 1, ascii(DATE)]
	];
	const gps = [
		[0x0001, 2, 2, ascii('N')],
		[0x0002, 5, 3, LATITUDE],
		[0x0003, 2, 2, ascii('E')],
		[0x0004, 5, 3, LONGITUDE]
	];

	const tailleIfd = (n) => 2 + 12 * n + 4;
	const debord = (entrees) => entrees.reduce((s, e) => s + (e[3].length > 4 ? e[3].length : 0), 0);
	const debutGps = 8 + tailleIfd(ifd0.length + 1) + debord(ifd0);
	const t = Buffer.alloc(debutGps + tailleIfd(gps.length) + debord(gps));
	t.write('II', 0, 'latin1');
	t.writeUInt16LE(42, 2);
	t.writeUInt32LE(8, 4);

	const ecrire = (debut, entrees) => {
		t.writeUInt16LE(entrees.length, debut);
		let suite = debut + tailleIfd(entrees.length);
		entrees.forEach(([balise, type, nombre, valeur], i) => {
			const e = debut + 2 + 12 * i;
			t.writeUInt16LE(balise, e);
			t.writeUInt16LE(type, e + 2);
			t.writeUInt32LE(nombre, e + 4);
			if (valeur.length <= 4) valeur.copy(t, e + 8);
			else {
				t.writeUInt32LE(suite, e + 8);
				valeur.copy(t, suite);
				suite += valeur.length;
			}
		});
	};
	const pointeurGps = Buffer.alloc(4);
	pointeurGps.writeUInt32LE(debutGps);
	ecrire(8, [...ifd0, [0x8825, 4, 1, pointeurGps]]);
	ecrire(debutGps, gps);
	return t;
}

const XMP = Buffer.from(
	'<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
		'<rdf:Description xmlns:exif="http://ns.adobe.com/exif/1.0/" exif:GPSLatitude="47,19.36N" ' +
		`exif:GPSLongitude="5,2.45E" exif:Make="${MARQUE}"/></rdf:RDF></x:xmpmeta>`,
	'latin1'
);

/** Rien de tout cela ne doit rester dans le fichier nettoyé. */
function assertSansTrace(octets) {
	assert.equal(octets.includes(MARQUE), false, 'la marque de l’appareil est restée');
	assert.equal(octets.includes(DATE), false, 'la date est restée');
	assert.equal(octets.includes(LATITUDE), false, 'la latitude est restée');
	assert.equal(octets.includes(LONGITUDE), false, 'la longitude est restée');
	assert.equal(octets.includes('GPSLatitude'), false, 'le XMP est resté');
}

/**
 * Relit une structure TIFF, indépendamment du code testé : les entrées du
 * premier répertoire, et la position du suivant (celui de la miniature).
 */
function lireTiff(t) {
	const ii = t.toString('latin1', 0, 2) === 'II';
	const u16 = (p) => (ii ? t.readUInt16LE(p) : t.readUInt16BE(p));
	const u32 = (p) => (ii ? t.readUInt32LE(p) : t.readUInt32BE(p));
	assert.equal(u16(2), 42);
	const ifd = u32(4);
	const n = u16(ifd);
	const entrees = [];
	for (let i = 0; i < n; i++) {
		const e = ifd + 2 + 12 * i;
		entrees.push({ balise: u16(e), type: u16(e + 2), nombre: u32(e + 4), valeur: u16(e + 8) });
	}
	return { entrees, suivant: u32(ifd + 2 + 12 * n), taille: t.length };
}

/** L'EXIF nettoyé ne contient que l'orientation, et pas de miniature. */
function assertOrientationSeule(tiff, orientation) {
	const lu = lireTiff(tiff);
	assert.deepEqual(lu.entrees, [{ balise: 0x0112, type: 3, nombre: 1, valeur: orientation }]);
	assert.equal(lu.suivant, 0);
	assert.equal(lu.taille, 26);
}

/* ------------------------------------------------------------------ outils */

/** libjpeg et libwebp, s'ils sont installés, pour décoder pour de bon. */
const present = (outil) => !spawnSync(outil, ['-version']).error;
const DJPEG = present('djpeg');
const DWEBP = present('dwebp');

function decoder(outil, octets, extension) {
	const dossier = mkdtempSync(join(tmpdir(), 'metadonnees-'));
	try {
		const entree = join(dossier, `image.${extension}`);
		writeFileSync(entree, octets);
		const args = outil === 'djpeg' ? ['-pnm', entree] : [entree, '-ppm', '-o', '-'];
		const r = spawnSync(outil, args, { maxBuffer: 64 * 1024 * 1024 });
		assert.equal(r.status, 0, `${outil} refuse l'image : ${r.stderr}`);
		return r.stdout;
	} finally {
		rmSync(dossier, { recursive: true, force: true });
	}
}

/* ------------------------------------------------------------------ JPEG */

function segment(marqueur, donnees) {
	const entete = Buffer.from([0xff, marqueur, 0, 0]);
	entete.writeUInt16BE(donnees.length + 2, 2);
	return Buffer.concat([entete, donnees]);
}

/**
 * Le plus petit JPEG qui soit : une image grise unie, 16 × 8 pixels, deux
 * blocs. Chaque table de Huffman n'a qu'un code, « 0 » : chaque bloc s'écrit
 * donc en deux bits (« pas de variation », « fin du bloc »).
 */
function imageJpeg() {
	const huffman = (classe) => Buffer.concat([Buffer.from([classe, 1]), Buffer.alloc(15), Buffer.from([0])]);
	return {
		tables: [
			segment(0xdb, Buffer.concat([Buffer.from([0]), Buffer.alloc(64, 1)])), // quantification
			segment(0xc0, Buffer.from([8, 0, 8, 0, 16, 1, 1, 0x11, 0])), // cadre : 8 de haut, 16 de large, gris
			segment(0xc4, huffman(0x00)), // coefficients continus
			segment(0xc4, huffman(0x10)) // coefficients alternatifs
		],
		balayage: Buffer.concat([segment(0xda, Buffer.from([1, 1, 0, 0, 63, 0])), Buffer.from([0x0f])]),
		fin: Buffer.from([0xff, 0xd9])
	};
}

/** Une photo de téléphone : JFIF avec miniature, EXIF, XMP, IPTC, commentaire, et une vidéo après la fin. */
function jpegDeTelephone(orientation) {
	const { tables, balayage, fin } = imageJpeg();
	const jfif = Buffer.concat([Buffer.from('JFIF\0', 'latin1'), Buffer.from([1, 1, 0, 0, 72, 0, 72, 1, 1]), Buffer.alloc(3, 0x80)]);
	return Buffer.concat([
		Buffer.from([0xff, 0xd8]),
		segment(0xe0, jfif),
		segment(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), exifDeTelephone(orientation)])),
		segment(0xe1, Buffer.concat([Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'latin1'), XMP])),
		segment(0xe2, Buffer.from('ICC_PROFILE\0\x01\x01profil-de-couleur', 'latin1')),
		segment(0xed, Buffer.from(`Photoshop 3.0\0${MARQUE}`, 'latin1')),
		segment(0xfe, Buffer.from(`Pris par ${MARQUE}`, 'latin1')),
		...tables,
		balayage,
		fin,
		Buffer.from(`....ftypmp42 video de ${MARQUE}`, 'latin1')
	]);
}

/** Les segments d'un JPEG jusqu'au balayage, puis tout ce qui suit d'un bloc. */
function segmentsJpeg(octets) {
	const segments = [];
	let pos = 2;
	while (octets[pos + 1] !== 0xda) {
		const longueur = octets.readUInt16BE(pos + 2);
		segments.push({ marqueur: octets[pos + 1], donnees: octets.subarray(pos + 4, pos + 2 + longueur) });
		pos += 2 + longueur;
	}
	return { segments, suite: octets.subarray(pos) };
}

test('JPEG : la position, la marque, la date, le XMP et la vidéo disparaissent', () => {
	const photo = jpegDeTelephone(6);
	const { octets, position, retire } = retirerMetadonnees(photo, 'image/jpeg');

	assertSansTrace(octets);
	assert.equal(position, true);
	for (const nom of ['EXIF', 'XMP', 'IPTC', 'commentaires', 'miniature', 'données placées après l’image']) {
		assert.ok(retire.includes(nom), `${nom} n'est pas signalé comme retiré`);
	}
	const { segments, suite } = segmentsJpeg(octets);
	assert.deepEqual(
		segments.map((s) => s.marqueur),
		[0xe0, 0xe1, 0xe2, 0xdb, 0xc0, 0xc4, 0xc4],
		'il reste JFIF, l’orientation, le profil de couleur et les tables'
	);
	// JFIF garde sa densité, perd sa miniature.
	assert.deepEqual([...segments[0].donnees], [...Buffer.from('JFIF\0', 'latin1'), 1, 1, 0, 0, 72, 0, 72, 0, 0]);
	assert.equal(octets.subarray(-2).toString('hex'), 'ffd9', 'rien après la fin de l’image');
});

test('JPEG : l’orientation reste, seule, à la place de l’EXIF', () => {
	const { octets } = retirerMetadonnees(jpegDeTelephone(6), 'image/jpeg');
	const exif = segmentsJpeg(octets).segments.find((s) => s.marqueur === 0xe1);
	assert.ok(exif, 'l’EXIF minimal est absent');
	assert.equal(exif.donnees.toString('latin1', 0, 6), 'Exif\0\0');
	assertOrientationSeule(exif.donnees.subarray(6), 6);
});

test('JPEG : sans rotation à faire, il ne reste aucun EXIF', () => {
	const { octets } = retirerMetadonnees(jpegDeTelephone(1), 'image/jpeg');
	assert.equal(segmentsJpeg(octets).segments.some((s) => s.marqueur === 0xe1), false);
});

test('JPEG : l’image elle-même est intacte, octet pour octet', () => {
	const photo = jpegDeTelephone(6);
	const { octets } = retirerMetadonnees(photo, 'image/jpeg');
	const avant = segmentsJpeg(photo);
	const apres = segmentsJpeg(octets);
	const tables = (s) => s.segments.filter((x) => x.marqueur >= 0xc0 && x.marqueur <= 0xdb).map((x) => x.donnees.toString('hex'));
	assert.deepEqual(tables(apres), tables(avant));
	const { balayage, fin } = imageJpeg();
	assert.deepEqual(apres.suite, Buffer.concat([balayage, fin]));
});

test('JPEG : décodé par libjpeg, les pixels sont les mêmes', { skip: !DJPEG && 'djpeg absent' }, () => {
	const photo = jpegDeTelephone(6);
	const { octets } = retirerMetadonnees(photo, 'image/jpeg');
	const pixels = decoder('djpeg', octets, 'jpg');
	assert.deepEqual(pixels, decoder('djpeg', photo, 'jpg'));
	// En-tête PGM, puis 16 × 8 pixels de gris moyen.
	assert.deepEqual(pixels, Buffer.concat([Buffer.from('P5\n16 8\n255\n', 'latin1'), Buffer.alloc(128, 128)]));
});

test('JPEG : une vraie image, sortie d’un vrai encodeur, perd son commentaire et se décode', () => {
	const demo = octetsImageDemo();
	assert.ok(demo.includes('CREATOR: gd-jpeg'), 'l’image de démonstration a changé');
	const { octets, retire } = retirerMetadonnees(demo, 'image/jpeg');
	assert.equal(octets.includes('CREATOR'), false);
	assert.deepEqual(retire, ['commentaires']);
	if (DJPEG) assert.deepEqual(decoder('djpeg', octets, 'jpg'), decoder('djpeg', demo, 'jpg'));
});

/* ------------------------------------------------------------------- PNG */

function bloc(nom, donnees) {
	const b = Buffer.alloc(12 + donnees.length);
	b.writeUInt32BE(donnees.length);
	b.write(nom, 4, 'latin1');
	donnees.copy(b, 8);
	b.writeUInt32BE(crc32(b.subarray(4, 8 + donnees.length)), 8 + donnees.length);
	return b;
}

/** Quatre pixels sur deux lignes : rouge, vert / bleu, blanc. */
const PIXELS = [
	[255, 0, 0, 0, 255, 0],
	[0, 0, 255, 255, 255, 255]
];

function pngDeTelephone(orientation) {
	const ihdr = Buffer.from([0, 0, 0, 2, 0, 0, 0, 2, 8, 2, 0, 0, 0]); // 2 × 2, 8 bits, couleur
	const lignes = Buffer.concat(PIXELS.map((l) => Buffer.from([0, ...l]))); // filtre 0 sur chaque ligne
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		bloc('IHDR', ihdr),
		bloc('eXIf', exifDeTelephone(orientation)),
		bloc('tEXt', Buffer.from(`Author\0${MARQUE}`, 'latin1')),
		bloc('iTXt', Buffer.concat([Buffer.from('XML:com.adobe.xmp\0\0\0\0\0', 'latin1'), XMP])),
		bloc('tIME', Buffer.from([0x07, 0xea, 10, 23, 19, 30, 0])),
		bloc('pHYs', Buffer.from([0, 0, 0x0b, 0x13, 0, 0, 0x0b, 0x13, 1])),
		bloc('IDAT', deflateSync(lignes)),
		bloc('IEND', Buffer.alloc(0))
	]);
}

/** Relit les blocs d'un PNG, en vérifiant chaque somme de contrôle. */
function blocsPng(octets) {
	const blocs = [];
	for (let pos = 8; pos < octets.length; ) {
		const longueur = octets.readUInt32BE(pos);
		const nom = octets.toString('latin1', pos + 4, pos + 8);
		assert.equal(crc32(octets.subarray(pos + 4, pos + 8 + longueur)), octets.readUInt32BE(pos + 8 + longueur), `somme de contrôle de ${nom}`);
		blocs.push({ nom, donnees: octets.subarray(pos + 8, pos + 8 + longueur) });
		pos += 12 + longueur;
	}
	return blocs;
}

test('PNG : la position, les textes et la date disparaissent', () => {
	const { octets, position, retire } = retirerMetadonnees(pngDeTelephone(6), 'image/png');
	assertSansTrace(octets);
	assert.equal(position, true);
	assert.deepEqual(retire.sort(), ['EXIF', 'date', 'textes']);
	assert.deepEqual(
		blocsPng(octets).map((b) => b.nom),
		['IHDR', 'eXIf', 'pHYs', 'IDAT', 'IEND']
	);
});

test('PNG : l’orientation reste, seule, avant les pixels', () => {
	const { octets } = retirerMetadonnees(pngDeTelephone(8), 'image/png');
	const exif = blocsPng(octets).find((b) => b.nom === 'eXIf');
	assert.ok(exif);
	assertOrientationSeule(exif.donnees, 8);

	const sansRotation = retirerMetadonnees(pngDeTelephone(1), 'image/png').octets;
	assert.equal(blocsPng(sansRotation).some((b) => b.nom === 'eXIf'), false);
});

test('PNG : décompressés, les pixels sont les mêmes', () => {
	const { octets } = retirerMetadonnees(pngDeTelephone(6), 'image/png');
	const donnees = inflateSync(Buffer.concat(blocsPng(octets).filter((b) => b.nom === 'IDAT').map((b) => b.donnees)));
	assert.deepEqual([...donnees], PIXELS.flatMap((l) => [0, ...l]));
});

/* ------------------------------------------------------------------ WebP */

/**
 * Une image WebP sans perte, d'une seule couleur, écrite bit à bit. Chacun
 * des cinq codes (vert, rouge, bleu, opacité, distance) n'a qu'un symbole :
 * lire un pixel ne coûte donc aucun bit, et toute l'image tient en 13 octets.
 */
function vp8lUnie(largeur, hauteur, [r, v, b, a]) {
	const bits = [];
	const ecrire = (valeur, n) => {
		for (let i = 0; i < n; i++) bits.push((valeur >> i) & 1);
	};
	ecrire(0x2f, 8); // signature
	ecrire(largeur - 1, 14);
	ecrire(hauteur - 1, 14);
	ecrire(0, 1); // pas de transparence
	ecrire(0, 3); // version 0
	ecrire(0, 1); // aucune transformation
	ecrire(0, 1); // pas de cache de couleurs
	ecrire(0, 1); // un seul groupe de codes
	for (const symbole of [v, r, b, a, 0]) {
		ecrire(1, 1); // code simple…
		ecrire(0, 1); // … d'un seul symbole…
		ecrire(1, 1); // … écrit sur huit bits
		ecrire(symbole, 8);
	}
	const octets = Buffer.alloc(Math.ceil(bits.length / 8));
	bits.forEach((bit, i) => (octets[i >> 3] |= bit << (i & 7)));
	return octets;
}

function morceau(nom, donnees) {
	const b = Buffer.alloc(8 + donnees.length + (donnees.length % 2));
	b.write(nom, 0, 'latin1');
	b.writeUInt32LE(donnees.length, 4);
	donnees.copy(b, 8);
	return b;
}

const ORANGE = [255, 128, 0, 255];
const VP8L = morceau('VP8L', vp8lUnie(4, 2, ORANGE));

function webpDeTelephone(orientation, prefixe = '') {
	const vp8x = Buffer.alloc(10);
	vp8x[0] = 0x08 | 0x04; // EXIF et XMP annoncés
	vp8x.writeUIntLE(4 - 1, 4, 3);
	vp8x.writeUIntLE(2 - 1, 7, 3);
	const blocs = Buffer.concat([
		morceau('VP8X', vp8x),
		VP8L,
		morceau('EXIF', Buffer.concat([Buffer.from(prefixe, 'latin1'), exifDeTelephone(orientation)])),
		morceau('XMP ', XMP)
	]);
	const entete = Buffer.from('RIFF....WEBP', 'latin1');
	entete.writeUInt32LE(4 + blocs.length, 4);
	return Buffer.concat([entete, blocs]);
}

/** Relit un WebP : la taille annoncée, et ses blocs. */
function blocsWebp(octets) {
	assert.equal(octets.readUInt32LE(4), octets.length - 8, 'la taille RIFF ne correspond pas au fichier');
	const blocs = [];
	for (let pos = 12; pos < octets.length; ) {
		const taille = octets.readUInt32LE(pos + 4);
		blocs.push({ nom: octets.toString('latin1', pos, pos + 4), brut: octets.subarray(pos, pos + 8 + taille + (taille % 2)) });
		pos += 8 + taille + (taille % 2);
	}
	return blocs;
}

test('WebP : la position et le XMP disparaissent, les drapeaux et la taille suivent', () => {
	const { octets, position, retire } = retirerMetadonnees(webpDeTelephone(6), 'image/webp');
	assertSansTrace(octets);
	assert.equal(position, true);
	assert.deepEqual(retire.sort(), ['EXIF', 'XMP']);
	const blocs = blocsWebp(octets);
	assert.deepEqual(blocs.map((b) => b.nom), ['VP8X', 'VP8L', 'EXIF']);
	assert.equal(blocs[0].brut[8], 0x08, 'VP8X doit annoncer l’EXIF, plus le XMP');
	assert.deepEqual(blocs[1].brut, VP8L, 'l’image doit être intacte');
});

test('WebP : l’orientation reste seule ; sans rotation, plus d’EXIF du tout', () => {
	for (const prefixe of ['', 'Exif\0\0']) {
		const { octets } = retirerMetadonnees(webpDeTelephone(3, prefixe), 'image/webp');
		const exif = blocsWebp(octets).find((b) => b.nom === 'EXIF');
		assert.ok(exif);
		assert.equal(exif.brut.toString('latin1', 8, 8 + prefixe.length), prefixe);
		assertOrientationSeule(exif.brut.subarray(8 + prefixe.length), 3);
	}
	const { octets } = retirerMetadonnees(webpDeTelephone(1), 'image/webp');
	const blocs = blocsWebp(octets);
	assert.deepEqual(blocs.map((b) => b.nom), ['VP8X', 'VP8L']);
	assert.equal(blocs[0].brut[8], 0, 'VP8X ne doit plus rien annoncer');
});

test('WebP : décodé par libwebp, l’image est la même', { skip: !DWEBP && 'dwebp absent' }, () => {
	const photo = webpDeTelephone(6);
	const pixels = decoder('dwebp', retirerMetadonnees(photo, 'image/webp').octets, 'webp');
	assert.deepEqual(pixels, decoder('dwebp', photo, 'webp'));
	const orange = Buffer.from(Array.from({ length: 8 }, () => ORANGE.slice(0, 3)).flat());
	assert.deepEqual(pixels, Buffer.concat([Buffer.from('P6\n4 2\n255\n', 'latin1'), orange]));
});

/* ------------------------------------------------------------------- GIF */

/** Des sous-blocs GIF : un octet de longueur, le contenu, et un bloc vide pour finir. */
function sousBlocs(texte) {
	return Buffer.concat([Buffer.from([texte.length]), Buffer.from(texte, 'latin1'), Buffer.from([0])]);
}

/** Le XMP d'un GIF suit une astuce : le texte brut, puis 258 octets qui ramènent le lecteur au bloc vide. */
const XMP_GIF = Buffer.concat([
	Buffer.from([0x21, 0xff, 11]),
	Buffer.from('XMP DataXMP', 'latin1'),
	XMP,
	Buffer.from([1, ...Array.from({ length: 255 }, (_, i) => 255 - i), 0, 0])
]);
const BOUCLE = Buffer.concat([Buffer.from([0x21, 0xff, 11]), Buffer.from('NETSCAPE2.0', 'latin1'), Buffer.from([3, 1, 0, 0, 0])]);
const IMAGE_GIF = Buffer.from([0x21, 0xf9, 4, 0, 10, 0, 0, 0, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 1, 0]);

test('GIF : le commentaire et le XMP disparaissent, l’animation reste', () => {
	const ecran = Buffer.concat([Buffer.from('GIF89a', 'latin1'), Buffer.from([1, 0, 1, 0, 0x80, 0, 0, 255, 0, 0, 0, 0, 255])]);
	const photo = Buffer.concat([ecran, BOUCLE, Buffer.from([0x21, 0xfe]), sousBlocs(`Pris par ${MARQUE}`), XMP_GIF, IMAGE_GIF, Buffer.from([0x3b])]);
	const { octets, position, retire } = retirerMetadonnees(photo, 'image/gif');
	assertSansTrace(octets);
	assert.equal(position, true);
	assert.deepEqual(retire.sort(), ['XMP', 'commentaires']);
	assert.deepEqual(octets, Buffer.concat([ecran, BOUCLE, IMAGE_GIF, Buffer.from([0x3b])]));
});

/* ------------------------------------------------------------------ AVIF */

function boite(nom, ...contenus) {
	const contenu = Buffer.concat(contenus);
	const b = Buffer.alloc(8);
	b.writeUInt32BE(8 + contenu.length);
	b.write(nom, 4, 'latin1');
	return Buffer.concat([b, contenu]);
}
const pleine = (nom, version, ...contenus) => boite(nom, Buffer.from([version, 0, 0, 0]), ...contenus);
const u16 = (v) => Buffer.from([v >> 8, v & 255]);
const u32 = (v) => {
	const b = Buffer.alloc(4);
	b.writeUInt32BE(v);
	return b;
};

/**
 * Un AVIF tel qu'en écrit un téléphone : l'image (élément 1), un EXIF
 * (élément 2) rangé dans mdat, un XMP (élément 3) rangé dans idat, et une
 * boîte inconnue au premier niveau. Les pixels sont factices : seule la
 * structure compte ici, le décodage a été vérifié sur un vrai fichier.
 */
const PIXELS_AV1 = Buffer.from('donnees-compressees-de-l-image-AV1', 'latin1');
const EXIF_AVIF = Buffer.concat([u32(0), exifDeTelephone(6)]);

function avifDeTelephone() {
	const ftyp = boite('ftyp', Buffer.from('avif\0\0\0\0avifmif1miaf', 'latin1'));
	const infe = (numero, type, suite = '') => pleine('infe', 2, u16(numero), u16(0), Buffer.from(type + '\0' + suite, 'latin1'));
	const iinf = pleine('iinf', 0, u16(3), infe(1, 'av01'), infe(2, 'Exif'), infe(3, 'mime', 'application/rdf+xml\0'));
	const idat = boite('idat', XMP);
	const inconnue = boite('uuid', Buffer.alloc(16, 7), Buffer.from(`signature de ${MARQUE}`, 'latin1'));

	// iloc, version 1 : décalages et longueurs sur 4 octets, ni base ni index.
	const iloc = (debutMdat) =>
		pleine(
			'iloc',
			1,
			Buffer.from([0x44, 0x00]),
			u16(3),
			...[
				[1, 0, debutMdat + 8, PIXELS_AV1.length],
				[2, 0, debutMdat + 8 + PIXELS_AV1.length, EXIF_AVIF.length],
				[3, 1, 0, XMP.length]
			].map(([numero, methode, decalage, longueur]) => Buffer.concat([u16(numero), u16(methode), u16(0), u16(1), u32(decalage), u32(longueur)]))
		);
	const meta = (debutMdat) =>
		pleine('meta', 0, pleine('hdlr', 0, u32(0), Buffer.from('pict', 'latin1'), Buffer.alloc(13)), pleine('pitm', 0, u16(1)), iinf, iloc(debutMdat), idat);

	const debutMdat = ftyp.length + meta(0).length + inconnue.length;
	return Buffer.concat([ftyp, meta(debutMdat), inconnue, boite('mdat', PIXELS_AV1, EXIF_AVIF)]);
}

test('AVIF : l’EXIF et le XMP sont effacés sur place, l’image et la structure ne bougent pas', () => {
	const photo = avifDeTelephone();
	const { octets, position, retire } = retirerMetadonnees(photo, 'image/avif');
	assertSansTrace(octets);
	assert.equal(position, true);
	assert.deepEqual(retire.sort(), ['EXIF', 'XMP', 'autres blocs']);
	assert.equal(octets.length, photo.length, 'les positions notées dans iloc doivent rester justes');

	const ecart = [];
	for (let i = 0; i < photo.length; i++) if (photo[i] !== octets[i]) ecart.push(i);
	const zone = (morceau) => {
		const debut = photo.indexOf(morceau);
		return Array.from({ length: morceau.length }, (_, i) => debut + i);
	};
	// Seuls changent les octets de l'EXIF, du XMP, et le nom et le contenu de la boîte inconnue.
	const inconnue = photo.indexOf('uuid') - 4;
	const attendu = new Set([...zone(EXIF_AVIF), ...zone(XMP), ...Array.from({ length: photo.readUInt32BE(inconnue) - 4 }, (_, i) => inconnue + 4 + i)]);
	assert.ok(ecart.every((i) => attendu.has(i)), 'des octets hors des métadonnées ont changé');
	assert.ok(octets.includes(PIXELS_AV1), 'l’image doit être intacte');
	assert.equal(octets.toString('latin1', inconnue + 4, inconnue + 8), 'free');
	assert.ok(octets.subarray(photo.indexOf(EXIF_AVIF), photo.indexOf(EXIF_AVIF) + EXIF_AVIF.length).every((o) => o === 0));
});

/* ----------------------------------------------------- toutes les images */

const PHOTOS = {
	'image/jpeg': () => jpegDeTelephone(6),
	'image/png': () => pngDeTelephone(6),
	'image/webp': () => webpDeTelephone(6),
	'image/avif': () => avifDeTelephone()
};

test('nettoyer une image déjà nettoyée ne change plus rien', () => {
	for (const [mime, photo] of Object.entries(PHOTOS)) {
		const une = retirerMetadonnees(photo(), mime).octets;
		assert.deepEqual(retirerMetadonnees(une, mime).octets, une, mime);
	}
});

test('un fichier abîmé est refusé, jamais enregistré à moitié nettoyé', () => {
	const refuse = (octets, mime, raison) =>
		assert.throws(
			() => retirerMetadonnees(octets, mime),
			(e) => e instanceof ImageIllisible && e.message.startsWith('Image illisible'),
			raison
		);

	const jpeg = jpegDeTelephone(6);
	refuse(jpeg.subarray(0, jpeg.indexOf(Buffer.from([0xff, 0xda])) + 6), 'image/jpeg', 'JPEG coupé au milieu');
	refuse(jpeg.subarray(0, 30), 'image/jpeg', 'JPEG coupé dans l’EXIF');
	const sansImage = Buffer.concat([Buffer.from([0xff, 0xd8]), segment(0xfe, Buffer.from('rien')), Buffer.from([0xff, 0xd9])]);
	refuse(sansImage, 'image/jpeg', 'JPEG sans image');

	const png = Buffer.from(pngDeTelephone(6));
	png[png.indexOf('IDAT') + 6] ^= 1;
	refuse(png, 'image/png', 'PNG dont un bloc ne correspond plus à sa somme de contrôle');
	refuse(pngDeTelephone(6).subarray(0, -12), 'image/png', 'PNG sans IEND');

	const webp = Buffer.from(webpDeTelephone(6));
	webp.writeUInt32LE(webp.length, 4);
	refuse(webp, 'image/webp', 'WebP plus court que sa taille annoncée');
	refuse(Buffer.concat([Buffer.from('RIFF\x0c\0\0\0WEBPXMP \0\0\0\0', 'latin1')]), 'image/webp', 'WebP sans image');

	refuse(Buffer.concat([Buffer.from('GIF89a', 'latin1'), Buffer.from([1, 0, 1, 0, 0, 0, 0]), IMAGE_GIF]), 'image/gif', 'GIF sans fin');

	const avif = Buffer.from(avifDeTelephone());
	avif.writeUInt32BE(avif.length + 1, 0);
	refuse(avif, 'image/avif', 'AVIF dont une boîte dépasse du fichier');
});
