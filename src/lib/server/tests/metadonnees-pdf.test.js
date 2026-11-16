// @ts-nocheck - comme les jeux, ce fichier est vérifié par `node --test`, pas par `npm run check`.
/**
 * Tests du nettoyage des PDF (`metadonnees-pdf.ts`).
 *
 *     node --test src/lib/server/tests/*.test.js
 *
 * Chaque PDF est fabriqué ici avec ce qu'y met un traitement de texte : une
 * fiche qui donne le nom de la personne (Camille Martin), le logiciel et les
 * dates, la même chose en XMP, et selon les cas une photo avec sa position
 * GPS, des commentaires signés, une pièce jointe, une signature. On vérifie
 * que tout cela disparaît - y compris quand le PDF est compressé, ou qu'il
 * garde une ancienne version de sa fiche - et que les pages, elles, n'ont pas
 * bougé.
 *
 * Les vérifications sont faites par un code distinct de celui qu'on teste.
 * Quand `qpdf` et `gs` (Ghostscript) sont installés, chaque PDF nettoyé est en
 * plus contrôlé par qpdf, et ses pages sont dessinées par Ghostscript pour
 * comparer l'image avec celle de l'original.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';
import { PdfIllisible, retirerMetadonneesPdf } from '../metadonnees-pdf.ts';
import { retirerMetadonnees } from '../metadonnees-images.ts';
import { octetsImageDemo } from '../demo-image.ts';

/* --------------------------------------------- ce que met un traitement de texte */

const NOM = 'Camille Martin';
const LOGICIEL = 'LOGICIEL-DE-TRAITEMENT-DE-TEXTE';
const DATE = "D:20261023193000+02'00'";
const TEXTE_PAGE = 'BT /F1 24 Tf 20 40 Td (Bonjour Dijon) Tj ET';

const FICHE =
	`<< /Author (${NOM}) /Title (Brouillon du tract) /Subject (Le sujet) /Keywords (tract, Dijon) ` +
	`/Creator (${LOGICIEL}) /Producer (${LOGICIEL}) /CreationDate (${DATE}) /ModDate (${DATE}) >>`;

const XMP =
	'<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
	'<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/">' +
	`<dc:creator><rdf:Seq><rdf:li>${NOM}</rdf:li></rdf:Seq></dc:creator>` +
	`<xmp:CreatorTool>${LOGICIEL}</xmp:CreatorTool><xmp:CreateDate>2026-10-23T19:30:00+02:00</xmp:CreateDate>` +
	'</rdf:Description></rdf:RDF></x:xmpmeta>';

const octets = (x) => (Buffer.isBuffer(x) ? x : Buffer.from(x, 'latin1'));

/** Le corps d'un flux : son dictionnaire, puis ses données. */
function flux(dico, donnees) {
	const d = octets(donnees);
	return Buffer.concat([octets(`<< ${dico} /Length ${d.length} >>\nstream\n`), d, octets('\nendstream')]);
}

/**
 * Assemble un PDF : en-tête, objets ([numéro, corps]), table en clair,
 * trailer. Avec `suite`, ajoute une mise à jour à la fin d'un PDF existant,
 * comme le fait Acrobat : de nouveaux objets, une nouvelle table qui renvoie à
 * l'ancienne (/Prev). Rien n'est effacé de l'ancien fichier.
 */
function assembler(objets, trailer, suite = null) {
	const morceaux = [suite ? suite.octets : octets('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n')];
	let taille = morceaux[0].length;
	const positions = [];
	for (const [num, corps] of objets) {
		positions.push([num, taille]);
		const b = Buffer.concat([octets(`${num} 0 obj\n`), octets(corps), octets('\nendobj\n')]);
		morceaux.push(b);
		taille += b.length;
	}
	let table = suite ? 'xref\n' : 'xref\n0 1\n0000000000 65535 f\r\n';
	for (const [num, p] of positions.sort((a, b) => a[0] - b[0])) table += `${num} 1\n${String(p).padStart(10, '0')} 00000 n\r\n`;
	table += `trailer\n<< ${trailer}${suite ? ` /Prev ${suite.table}` : ''} >>\nstartxref\n${taille}\n%%EOF\n`;
	morceaux.push(octets(table));
	return { octets: Buffer.concat(morceaux), table: taille };
}

const PAGE = '/Type /Page /Parent 2 0 R /MediaBox [0 0 300 100] /Contents 4 0 R /Resources << /Font << /F1 6 0 R >> >>';
const POLICE = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

/** Un PDF tel que l'exporte un traitement de texte : fiche, XMP, et deux tiroirs de logiciel sur la page. */
function pdfExporte() {
	return assembler(
		[
			[1, '<< /Type /Catalog /Pages 2 0 R /Metadata 5 0 R /Lang (fr-FR) >>'],
			[2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'],
			[3, `<< ${PAGE} /LastModified (${DATE}) /PieceInfo << /Logiciel << /Prive (${NOM}) >> >> >>`],
			[4, flux('', TEXTE_PAGE)],
			[5, flux('/Type /Metadata /Subtype /XML', XMP)],
			[6, POLICE],
			[7, FICHE]
		],
		'/Size 8 /Root 1 0 R /Info 7 0 R /ID [<00112233> <00112233>]'
	);
}

/* ------------------------------------------------------------------ outils */

/**
 * Relit un PDF nettoyé, indépendamment du code testé : la table en clair, et
 * chaque objet à la position qu'elle annonce. Rend le texte de chaque objet.
 */
function relire(pdf) {
	const texte = pdf.toString('latin1');
	assert.match(texte, /^%PDF-\d\.\d\n/);
	const fin = /startxref\n(\d+)\n%%EOF\n$/.exec(texte);
	assert.ok(fin, 'la fin du fichier est abîmée');
	const table = texte.slice(Number(fin[1]));
	const nombre = Number(/^xref\n0 (\d+)\n0000000000 65535 f\r\n/.exec(table)[1]);
	const positions = [...table.matchAll(/(\d{10}) 00000 n\r\n/g)].map((m) => Number(m[1]));
	assert.equal(positions.length, nombre - 1);
	const objets = new Map();
	positions.forEach((p, i) => {
		assert.ok(texte.startsWith(`${i + 1} 0 obj\n`, p), `l’objet ${i + 1} n’est pas à sa position`);
		objets.set(i + 1, texte.slice(p, texte.indexOf('\nendobj\n', p)));
	});
	const trailer = /trailer\n(<<.*>>)\nstartxref/.exec(table)[1];
	assert.equal(trailer, `<</Size ${nombre} /Root 1 0 R>>`, 'le trailer ne doit désigner que le catalogue');
	return objets;
}

/** Le fichier, plus le contenu décompressé de chacun de ses flux : rien ne doit s'y cacher. */
function toutLeContenu(pdf) {
	const morceaux = [pdf];
	for (let p = pdf.indexOf('stream'); p >= 0; p = pdf.indexOf('stream', p + 6)) {
		const debut = p + 6 + (pdf[p + 6] === 0x0d ? 2 : 1);
		const fin = pdf.indexOf('endstream', debut);
		if (fin < 0) break;
		try {
			morceaux.push(inflateSync(pdf.subarray(debut, fin)));
		} catch {
			// pas compressé
		}
	}
	return Buffer.concat(morceaux);
}

function assertSansTrace(pdf) {
	const tout = toutLeContenu(pdf);
	for (const trace of [NOM, LOGICIEL, DATE, 'xmpmeta', '/Author', '/Producer', '/Info', '/ID']) {
		assert.equal(tout.includes(trace), false, `« ${trace} » est resté`);
	}
}

const present = (outil, option) => !spawnSync(outil, [option]).error;
const QPDF = present('qpdf', '--version');
const GS = present('gs', '--version');

function avecFichier(pdf, faire) {
	const dossier = mkdtempSync(join(tmpdir(), 'metadonnees-pdf-'));
	try {
		const chemin = join(dossier, 'document.pdf');
		writeFileSync(chemin, pdf);
		return faire(chemin, dossier);
	} finally {
		rmSync(dossier, { recursive: true, force: true });
	}
}

/** qpdf relit le fichier en entier et signale la moindre anomalie. */
function assertValideSelonQpdf(pdf) {
	if (!QPDF) return;
	avecFichier(pdf, (chemin) => {
		const r = spawnSync('qpdf', ['--check', chemin], { encoding: 'utf8' });
		assert.equal(r.status, 0, `qpdf signale un problème : ${r.stdout}${r.stderr}`);
	});
}

/** Les pages, dessinées par Ghostscript. */
function rendu(pdf) {
	return avecFichier(pdf, (chemin) => {
		const r = spawnSync('gs', ['-q', '-dNOPAUSE', '-dBATCH', '-dSAFER', '-sDEVICE=png16m', '-r36', '-sOutputFile=-', chemin], {
			maxBuffer: 64 * 1024 * 1024
		});
		assert.equal(r.status, 0, `Ghostscript refuse le PDF : ${r.stderr}`);
		return r.stdout;
	});
}

function assertMemeRendu(original, nettoye) {
	if (GS) assert.deepEqual(rendu(nettoye), rendu(original), 'les pages ne s’affichent plus pareil');
}

/* --------------------------------------------------- le cas le plus courant */

test('PDF exporté : la fiche, le XMP, les dates et les tiroirs des logiciels disparaissent', () => {
	const original = pdfExporte().octets;
	assert.ok(original.includes(NOM));
	const { octets: propre, retire, auteur } = retirerMetadonneesPdf(original);

	assertSansTrace(propre);
	assert.equal(auteur, NOM, 'le compte rendu doit dire quel nom était inscrit');
	for (const nom of ['fiche du document', 'XMP', 'dates', 'données privées des logiciels']) {
		assert.ok(retire.includes(nom), `${nom} n'est pas signalé comme retiré`);
	}
	const objets = relire(propre);
	assert.match(objets.get(1), /^1 0 obj\n<<\/Type \/Catalog \/Pages 2 0 R \/Lang \(fr-FR\)>>$/);
	assert.equal(objets.size, 5, 'catalogue, pages, page, contenu, police : rien d’autre');
});

test('PDF exporté : le contenu de la page est recopié octet pour octet, et s’affiche pareil', () => {
	const original = pdfExporte().octets;
	const { octets: propre } = retirerMetadonneesPdf(original);
	assert.ok(propre.includes(`stream\n${TEXTE_PAGE}\nendstream`));
	assertValideSelonQpdf(propre);
	assertMemeRendu(original, propre);
});

test('un nom écrit avec des « #xx » est reconnu : /Metad#61ta est /Metadata', () => {
	const original = assembler(
		[
			[1, '<< /Type /Catalog /Pages 2 0 R /Metad#61ta 5 0 R >>'],
			[2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'],
			[3, `<< ${PAGE} >>`],
			[4, flux('', TEXTE_PAGE)],
			[5, flux('/Type /Metadata /Subtype /XML', XMP)],
			[6, POLICE]
		],
		'/Size 7 /Root 1 0 R'
	).octets;
	assertSansTrace(retirerMetadonneesPdf(original).octets);
});

/* -------------------------------------------- les versions précédentes */

test('mise à jour incrémentale : l’ancienne fiche, restée plus haut dans le fichier, disparaît aussi', () => {
	// La personne a retiré son nom avec Acrobat, qui a ajouté une nouvelle
	// fiche et un nouveau catalogue à la fin : l'ancienne fiche et l'ancien XMP
	// sont toujours dans le fichier.
	const base = pdfExporte();
	const original = assembler(
		[
			[1, '<< /Type /Catalog /Pages 2 0 R >>'],
			[7, '<< /Producer (Acrobat) >>']
		],
		'/Size 8 /Root 1 0 R /Info 7 0 R',
		base
	).octets;
	assert.ok(original.includes(NOM), 'le nom est encore dans le fichier d’origine');

	const { octets: propre, retire, auteur } = retirerMetadonneesPdf(original);
	assertSansTrace(propre);
	assert.equal(auteur, '', 'la fiche la plus récente n’a plus d’auteur');
	assert.ok(retire.includes('objets inutilisés'), 'l’ancien XMP n’est pas signalé');
	assert.equal(propre.includes('Acrobat'), false);
	relire(propre);
	assertValideSelonQpdf(propre);
	assertMemeRendu(original, propre);
});

/* ----------------------------------------------------------- compressé */

/**
 * Le même document, rangé comme le font les logiciels récents : les objets
 * sans flux - la fiche comprise - dans un flux d'objets compressé, le XMP
 * compressé, et la table des objets elle-même compressée, avec le
 * « prédicteur PNG ». Le nom n'apparaît nulle part en clair.
 *
 * `hybride` : comme Word, une table en clair pour les lecteurs anciens, qui
 * ne liste pas les objets compressés, et une table compressée qui les
 * complète (/XRefStm).
 */
function pdfCompresse({ hybride = false } = {}) {
	const dansLeFlux = [
		[1, '<< /Type /Catalog /Pages 2 0 R /Metadata 5 0 R >>'],
		[2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'],
		[3, `<< ${PAGE} >>`],
		[6, POLICE],
		[7, FICHE]
	];
	let entete = '';
	let corps = '';
	for (const [num, texte] of dansLeFlux) {
		entete += `${num} ${corps.length} `;
		corps += texte + '\n';
	}
	const enClair = [
		[4, flux('/Filter /FlateDecode', deflateSync(TEXTE_PAGE))],
		[5, flux('/Type /Metadata /Subtype /XML /Filter /FlateDecode', deflateSync(XMP))],
		[8, flux(`/Type /ObjStm /N ${dansLeFlux.length} /First ${entete.length} /Filter /FlateDecode`, deflateSync(entete + corps))]
	];

	const morceaux = [octets('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n')];
	let taille = morceaux[0].length;
	const lignes = new Map([[0, [0, 0, 65535]]]);
	for (const [num, c] of enClair) {
		lignes.set(num, [1, taille, 0]);
		const b = Buffer.concat([octets(`${num} 0 obj\n`), c, octets('\nendobj\n')]);
		morceaux.push(b);
		taille += b.length;
	}
	dansLeFlux.forEach(([num], rang) => lignes.set(num, [2, 8, rang]));
	lignes.set(9, [1, taille, 0]); // la table elle-même

	// Chaque ligne : un octet de type, quatre de position, deux de génération
	// ou de rang ; puis le prédicteur « Up » : chaque octet moins celui du dessus.
	const brut = [];
	let dessus = Buffer.alloc(7);
	for (let num = 0; num <= 9; num++) {
		const [type, a, b] = lignes.get(num);
		const ligne = Buffer.alloc(7);
		ligne[0] = type;
		ligne.writeUInt32BE(a, 1);
		ligne.writeUInt16BE(b, 5);
		brut.push(Buffer.from([2]), Buffer.from(ligne.map((o, j) => (o - dessus[j]) & 0xff)));
		dessus = ligne;
	}
	const table = flux(
		'/Type /XRef /Size 10 /W [1 4 2] /Root 1 0 R /Info 7 0 R /Filter /FlateDecode /DecodeParms << /Predictor 12 /Columns 7 >>',
		deflateSync(Buffer.concat(brut))
	);
	morceaux.push(Buffer.concat([octets('9 0 obj\n'), table, octets('\nendobj\n')]));
	const positionTable = taille;
	taille += morceaux.at(-1).length;

	if (!hybride) {
		morceaux.push(octets(`startxref\n${positionTable}\n%%EOF\n`));
		return Buffer.concat(morceaux);
	}
	let enTexte = 'xref\n0 1\n0000000000 65535 f\r\n';
	for (const num of [4, 5, 8, 9]) enTexte += `${num} 1\n${String(lignes.get(num)[1]).padStart(10, '0')} 00000 n\r\n`;
	enTexte += `trailer\n<< /Size 10 /Root 1 0 R /Info 7 0 R /XRefStm ${positionTable} >>\nstartxref\n${taille}\n%%EOF\n`;
	morceaux.push(octets(enTexte));
	return Buffer.concat(morceaux);
}

test('PDF compressé : la fiche rangée dans un flux d’objets disparaît, sans qu’on ait pu la voir en clair', () => {
	const original = pdfCompresse();
	// C'est ce qui interdit d'écraser le nom sur place : il n'est pas lisible tel quel.
	assert.equal(original.includes(NOM), false);
	assert.ok(toutLeContenu(original).includes(NOM));

	const { octets: propre, retire, auteur } = retirerMetadonneesPdf(original);
	assertSansTrace(propre);
	assert.equal(auteur, NOM);
	assert.ok(retire.includes('fiche du document') && retire.includes('XMP'));
	const objets = relire(propre);
	assert.equal(objets.size, 5);
	assert.equal(propre.includes('/ObjStm') || propre.includes('/XRef'), false, 'la structure de l’ancien fichier est restée');
	assert.ok(propre.includes(deflateSync(TEXTE_PAGE)), 'le contenu compressé de la page doit être recopié tel quel');
	assertValideSelonQpdf(propre);
	assertMemeRendu(original, propre);
});

test('PDF hybride, comme ceux de Word : les deux tables sont lues ensemble', () => {
	const original = pdfCompresse({ hybride: true });
	if (QPDF) assertValideSelonQpdf(original); // le PDF fabriqué est lui-même correct
	const { octets: propre, auteur } = retirerMetadonneesPdf(original);
	assertSansTrace(propre);
	assert.equal(auteur, NOM);
	assert.equal(relire(propre).size, 5);
	assertValideSelonQpdf(propre);
	assertMemeRendu(original, propre);
});

/* ---------------------------------------------------------------- photos */

const MARQUE = 'MARQUE-DU-TELEPHONE';
const LATITUDE = Buffer.from([47, 0, 0, 0, 1, 0, 0, 0, 19, 0, 0, 0, 1, 0, 0, 0]);

/** Une vraie photo JPEG, à laquelle on ajoute ce qu'y met un téléphone : sa marque et une position GPS. */
function photoDeTelephone() {
	const t = Buffer.alloc(200);
	t.write('II', 0, 'latin1');
	t.writeUInt16LE(42, 2);
	t.writeUInt32LE(8, 4);
	t.writeUInt16LE(2, 8); // deux entrées : la marque, le renvoi au répertoire GPS
	t.writeUInt16LE(0x010f, 10);
	t.writeUInt16LE(2, 12);
	t.writeUInt32LE(MARQUE.length + 1, 14);
	t.writeUInt32LE(100, 18);
	t.writeUInt16LE(0x8825, 22);
	t.writeUInt16LE(4, 24);
	t.writeUInt32LE(1, 26);
	t.writeUInt32LE(40, 30);
	t.writeUInt16LE(1, 40); // le répertoire GPS : la latitude
	t.writeUInt16LE(2, 42);
	t.writeUInt16LE(5, 44);
	t.writeUInt32LE(2, 46);
	t.writeUInt32LE(140, 50);
	t.write(MARQUE, 100, 'latin1');
	LATITUDE.copy(t, 140);
	const exif = Buffer.concat([octets('Exif\0\0'), t]);
	const segment = Buffer.from([0xff, 0xe1, 0, 0]);
	segment.writeUInt16BE(exif.length + 2, 2);
	const demo = octetsImageDemo();
	return Buffer.concat([demo.subarray(0, 2), segment, exif, demo.subarray(2)]);
}

/** Largeur et hauteur d'un JPEG, lues dans son cadre (SOF). */
function dimensions(jpeg) {
	for (let p = 2; p < jpeg.length; p += 2 + jpeg.readUInt16BE(p + 2)) {
		if (jpeg[p + 1] >= 0xc0 && jpeg[p + 1] <= 0xc2) return [jpeg.readUInt16BE(p + 7), jpeg.readUInt16BE(p + 5)];
	}
}

/** Comme Chrome ou l'impression de macOS : la photo est recopiée telle quelle dans le PDF. */
function pdfAvecPhoto() {
	const photo = photoDeTelephone();
	const [largeur, hauteur] = dimensions(photo);
	return {
		photo,
		pdf: assembler(
			[
				[1, '<< /Type /Catalog /Pages 2 0 R >>'],
				[2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'],
				[3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 150] /Contents 4 0 R /Resources << /XObject << /Im1 5 0 R >> >> >>'],
				[4, flux('', 'q 300 0 0 150 0 0 cm /Im1 Do Q')],
				[5, flux(`/Type /XObject /Subtype /Image /Width ${largeur} /Height ${hauteur} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, photo)],
				[6, FICHE]
			],
			'/Size 7 /Root 1 0 R /Info 6 0 R'
		).octets
	};
}

test('une photo recopiée telle quelle dans le PDF perd sa position GPS', () => {
	const { photo, pdf } = pdfAvecPhoto();
	assert.ok(pdf.includes(MARQUE) && pdf.includes(LATITUDE));
	const { octets: propre, retire, position } = retirerMetadonneesPdf(pdf);

	assert.equal(position, true, 'le compte rendu doit signaler la position');
	assert.ok(retire.includes('métadonnées des photos'));
	assert.equal(propre.includes(MARQUE), false);
	assert.equal(propre.includes(LATITUDE), false);
	// La photo est passée par le nettoyage des images, et par lui seul.
	assert.ok(propre.includes(retirerMetadonnees(photo, 'image/jpeg').octets));
	relire(propre);
	assertValideSelonQpdf(propre);
	assertMemeRendu(pdf, propre);
});

/* ------------------------------- commentaires, pièces jointes, signatures */

function pdfAnnote() {
	return assembler(
		[
			[
				1,
				'<< /Type /Catalog /Pages 2 0 R /Names << /EmbeddedFiles << /Names [(rapport.odt) 13 0 R] >> >> ' +
					'/AcroForm << /Fields [11 0 R 15 0 R] >> /Perms << /DocMDP 16 0 R >> >>'
			],
			[2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'],
			[3, `<< ${PAGE} /Annots [10 0 R 11 0 R 12 0 R 15 0 R] >>`],
			[4, flux('', TEXTE_PAGE)],
			[6, POLICE],
			[10, `<< /Type /Annot /Subtype /Text /Rect [0 0 20 20] /T (${NOM}) /Contents (Relire ce passage) /M (${DATE}) /CreationDate (${DATE}) >>`],
			[11, '<< /Type /Annot /Subtype /Widget /FT /Tx /Rect [50 0 150 20] /T (nom_du_champ) /V (une valeur) >>'],
			[12, '<< /Type /Annot /Subtype /FileAttachment /Rect [0 0 10 10] /FS 13 0 R >>'],
			[13, '<< /Type /Filespec /F (rapport-de-camille.odt) /EF << /F 14 0 R >> >>'],
			[14, flux('/Type /EmbeddedFile', `Le document d'origine, écrit par ${NOM}`)],
			[15, '<< /Type /Annot /Subtype /Widget /FT /Sig /Rect [0 0 0 0] /T (signature) /V 16 0 R >>'],
			[16, `<< /Type /Sig /Filter /Adobe.PPKLite /Name (${NOM}) /M (${DATE}) /ByteRange [0 10 20 10] /Contents <0000> >>`]
		],
		'/Size 17 /Root 1 0 R'
	).octets;
}

test('commentaires : le nom de leur auteur et leurs dates partent, leur texte et le nom des champs restent', () => {
	const original = pdfAnnote();
	const { octets: propre, retire } = retirerMetadonneesPdf(original);
	assertSansTrace(propre);
	assert.ok(retire.includes('auteurs des commentaires'));
	const tout = [...relire(propre).values()].join('\n');
	assert.match(tout, /\/Subtype \/Text \/Rect \[0 0 20 20\] \/Contents \(Relire ce passage\)>>/);
	assert.match(tout, /\/T \(nom_du_champ\)/, 'le nom d’un champ de formulaire est nécessaire au formulaire');
	assert.match(tout, /\/T \(signature\)/);
	assertValideSelonQpdf(propre);
});

test('pièces jointes et signatures disparaissent ; la page ne liste plus la pièce jointe', () => {
	const { octets: propre, retire } = retirerMetadonneesPdf(pdfAnnote());
	assert.ok(retire.includes('pièces jointes') && retire.includes('signatures'));
	for (const trace of ['rapport', '/EmbeddedFile', '/FileAttachment', '/Type /Sig', '/ByteRange', '/Perms']) {
		assert.equal(propre.includes(trace), false, `« ${trace} » est resté`);
	}
	// Les objets sont renumérotés dans l'ordre où on les rencontre : on cherche la page à son type.
	const page = [...relire(propre).values()].find((o) => o.includes('/Type /Page '));
	assert.match(page, /\/Annots \[\d+ 0 R \d+ 0 R \d+ 0 R\]/, 'trois annotations sur quatre restent, sans trou');
	// Le champ de signature reste, vide : le formulaire reste cohérent.
	assert.match([...relire(propre).values()].join('\n'), /\/FT \/Sig \/Rect \[0 0 0 0\] \/T \(signature\)>>/);
});

/* -------------------------------------------------------------- refus */

test('un PDF chiffré est refusé, avec un message qui dit pourquoi', () => {
	const chiffre = assembler(
		[
			[1, '<< /Type /Catalog /Pages 2 0 R >>'],
			[2, '<< /Type /Pages /Kids [] /Count 0 >>'],
			[3, '<< /Filter /Standard /V 1 /R 2 /O <00> /U <00> /P -4 >>']
		],
		'/Size 4 /Root 1 0 R /Encrypt 3 0 R'
	).octets;
	assert.throws(() => retirerMetadonneesPdf(chiffre), (e) => e instanceof PdfIllisible && /protégé/.test(e.message));
});

test('un fichier abîmé est refusé, jamais enregistré à moitié nettoyé', () => {
	const bon = pdfExporte().octets;
	const texte = bon.toString('latin1');
	const fin = Number(/startxref\n(\d+)/.exec(texte)[1]);
	const remplacer = (avant, apres) => octets(texte.replace(avant, apres));
	const cas = {
		'tronqué de moitié': bon.subarray(0, bon.length >> 1),
		'sans en-tête': octets('%PDX-1.7' + texte.slice(8)),
		'table annoncée au mauvais endroit': remplacer(`startxref\n${fin}`, `startxref\n${fin + 3}`),
		'catalogue absent de sa position': remplacer(/1 1\n\d{10}/, '1 1\n0000000020'),
		'longueur de flux fausse': remplacer(`/Length ${TEXTE_PAGE.length}`, `/Length ${TEXTE_PAGE.length + 5}`),
		'flux défini par lui-même': remplacer(`/Length ${TEXTE_PAGE.length}`, '/Length 4 0 R'),
		'tables en boucle': remplacer('/ID [<00112233> <00112233>]', `/Prev ${fin}`),
		'catalogue absent': remplacer('/Root 1 0 R', '/Root 99 0 R'),
		'valeur incompréhensible': remplacer('/Count 1', '/Count {1}'),
		'texte non terminé': remplacer('(fr-FR)', '(fr-FR'),
		'flux d’objets dans une compression inconnue': octets(pdfCompresse().toString('latin1').replace('/Type /ObjStm /N 5', '/Type /ObjStm /N 5 /Filter /LZWDecode'))
	};
	for (const [nom, pdf] of Object.entries(cas)) {
		assert.throws(() => retirerMetadonneesPdf(pdf), PdfIllisible, nom);
	}
});

/*
 * La fiche et le XMP sont retirés par la structure même du fichier : la fiche
 * n'est désignée que par le trailer, qui est réécrit, et le XMP l'est par sa
 * clé (/Metadata) et par son type. Un octet abîmé ne peut pas défaire les
 * deux à la fois. Le reste (PieceInfo, l'auteur d'un commentaire) est retiré
 * d'après le nom de sa clé : une clé mal écrite y échappe, comme elle échappe
 * aux lecteurs de PDF. LOGICIEL et « xmpmeta » ne figurent que dans la fiche
 * et le XMP.
 */
test('un octet changé au hasard : le PDF est refusé ou nettoyé, et la fiche et le XMP ne passent jamais', () => {
	// Un générateur pseudo-aléatoire fixe : le test refait toujours les mêmes essais.
	let graine = 12345;
	const hasard = (n) => ((graine = (graine * 1103515245 + 12345) % 2 ** 31) % n);
	for (const original of [pdfExporte().octets, pdfCompresse(), pdfAnnote()]) {
		for (let essai = 0; essai < 300; essai++) {
			const abime = Buffer.from(original);
			const position = hasard(abime.length);
			abime[position] = hasard(256);
			let propre;
			try {
				propre = retirerMetadonneesPdf(abime).octets;
			} catch (e) {
				assert.ok(e instanceof PdfIllisible, `erreur inattendue : ${e.stack}`);
				continue;
			}
			const tout = toutLeContenu(propre);
			assert.equal(tout.includes(LOGICIEL) || tout.includes('xmpmeta'), false, `la fiche ou le XMP est resté (octet ${position} changé)`);
		}
	}
});

test('la fiche n’est jamais recopiée, même quand un autre objet la désigne', () => {
	const original = assembler(
		[
			[1, '<< /Type /Catalog /Pages 2 0 R /CleDeLogiciel 7 0 R >>'],
			[2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'],
			[3, `<< ${PAGE} >>`],
			[4, flux('', TEXTE_PAGE)],
			[6, POLICE],
			[7, FICHE]
		],
		'/Size 8 /Root 1 0 R /Info 7 0 R'
	).octets;
	assertSansTrace(retirerMetadonneesPdf(original).octets);
});

/* ------------------------------------------------------------ stabilité */

test('nettoyer un PDF déjà nettoyé ne change plus rien', () => {
	for (const original of [pdfExporte().octets, pdfCompresse(), pdfCompresse({ hybride: true }), pdfAvecPhoto().pdf, pdfAnnote()]) {
		const une = retirerMetadonneesPdf(original);
		const deux = retirerMetadonneesPdf(une.octets);
		assert.deepEqual(deux.octets, une.octets);
		assert.deepEqual(deux.retire, [], 'un PDF nettoyé ne doit plus rien avoir à retirer');
		assert.equal(deux.auteur, '');
	}
});

/* ------------------------------------------------- PDF de vrais logiciels */

test('PDF compressé et linéarisé par qpdf', { skip: !QPDF && 'qpdf absent' }, () => {
	avecFichier(pdfExporte().octets, (chemin, dossier) => {
		const sortie = join(dossier, 'qpdf.pdf');
		const r = spawnSync('qpdf', ['--object-streams=generate', '--linearize', chemin, sortie]);
		assert.equal(r.status, 0, String(r.stderr));
		const original = readFileSync(sortie);
		const { octets: propre, auteur } = retirerMetadonneesPdf(original);
		assertSansTrace(propre);
		assert.equal(auteur, NOM);
		assertValideSelonQpdf(propre);
		assertMemeRendu(original, propre);
	});
});

test('PDF réécrit par Ghostscript', { skip: !GS && 'Ghostscript absent' }, () => {
	avecFichier(pdfExporte().octets, (chemin, dossier) => {
		const sortie = join(dossier, 'gs.pdf');
		const r = spawnSync('gs', ['-q', '-dNOPAUSE', '-dBATCH', '-dSAFER', '-sDEVICE=pdfwrite', `-sOutputFile=${sortie}`, chemin]);
		assert.equal(r.status, 0, String(r.stderr));
		const original = readFileSync(sortie);
		assert.ok(toutLeContenu(original).includes(NOM), 'Ghostscript recopie la fiche');
		const { octets: propre } = retirerMetadonneesPdf(original);
		assert.equal(toutLeContenu(propre).includes(NOM), false);
		assert.equal(toutLeContenu(propre).includes('xmpmeta'), false);
		assertValideSelonQpdf(propre);
		assertMemeRendu(original, propre);
	});
});

/* ---------------------------------------------------- l'envoi lui-même */

test('stockerPdf écrit le PDF nettoyé, et rien quand le PDF est illisible', async () => {
	const dossier = mkdtempSync(join(tmpdir(), 'bibliotheque-'));
	try {
		process.env.BIBLIOTHEQUE_PATH = dossier;
		const { stockerPdf } = await import('../bibliotheque.ts');

		const stocke = await stockerPdf(new File([pdfExporte().octets], 'tract.pdf'));
		const ecrit = readFileSync(join(dossier, stocke.filename));
		assert.equal(ecrit.includes(NOM), false);
		assert.equal(stocke.bytes, ecrit.length);

		await assert.rejects(stockerPdf(new File([pdfExporte().octets.subarray(0, 300)], 'abime.pdf')), /PDF illisible/);
		assert.deepEqual(readdirSync(dossier), [stocke.filename], 'un PDF refusé ne doit rien laisser sur le disque');
	} finally {
		rmSync(dossier, { recursive: true, force: true });
	}
});
