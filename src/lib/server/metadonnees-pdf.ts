import { constants, inflateSync } from 'node:zlib';
import { ImageIllisible, retirerMetadonnees } from './metadonnees-images.ts';

/**
 * Retire des PDF proposés tout ce qui dit qui les a faits.
 *
 * Un PDF exporté de Word, de LibreOffice ou de Pages porte une fiche (le
 * dictionnaire « Info ») et, souvent, une seconde copie de cette fiche en XML
 * (le flux « XMP ») : le nom inscrit comme auteur - celui du compte de
 * l'ordinateur, donc le plus souvent le vrai nom de la personne -, le titre de
 * travail, le logiciel, les dates à la seconde. Chrome et l'impression en PDF
 * de macOS y recopient aussi les photos telles quelles, position GPS
 * comprise. Une fois le PDF approuvé dans la bibliothèque, tout cela est
 * public.
 *
 * Écraser ces champs sur place ne suffit pas, pour deux raisons :
 *
 * - un PDF récent range la plupart de ses objets dans des « flux d'objets »
 *   compressés. Le nom de l'auteur n'y apparaît pas en clair, et on ne peut
 *   pas le remplacer sans recompresser, donc sans décaler tout ce qui suit ;
 * - un PDF retouché (par Acrobat, par une signature, par un formulaire
 *   rempli) garde ses versions successives les unes à la suite des autres. La
 *   fiche qu'on croit avoir vidée est encore là, plus haut dans le fichier.
 *
 * Le fichier est donc reconstruit. On part du catalogue, la racine du
 * document, et l'on recopie ce qu'il désigne, de proche en proche : les pages,
 * leur contenu, les polices, les images. Ce que rien ne désigne n'est pas
 * recopié : la fiche Info, les anciennes versions, les restes. En chemin, on
 * coupe les liens vers ce qui ne sert pas à afficher le document et peut dire
 * qui l'a fait (CLES_RETIREES, OBJETS_RETIRES) : le XMP, les pièces jointes
 * (LibreOffice peut y glisser le document d'origine tout entier), les
 * signatures, l'auteur des commentaires. Le contenu des pages et les polices
 * sont recopiés octet pour octet ; les photos JPEG passent par le nettoyage
 * des images (`metadonnees-images.ts`). Le document s'affiche comme avant.
 *
 * Ici, on dresse la liste de ce qu'il faut couper, quand le nettoyage des
 * images dresse celle de ce qu'il faut garder. Un PDF compte des centaines de
 * clés possibles : une liste fermée refuserait la moitié des fichiers. La
 * reconstruction tient lieu de liste fermée pour les objets : seul passe ce
 * que le document désigne. La fiche et le XMP ne dépendent donc pas de la
 * liste : la fiche n'est désignée que par le trailer, qui est réécrit, et le
 * XMP est reconnu à sa clé comme à son type. Le reste l'est au nom de sa clé,
 * et une clé mal écrite y échapperait - mais aucun lecteur ne la lirait non
 * plus.
 *
 * Comme pour les images, aucun fichier n'est enregistré à moitié nettoyé :
 * soit tout ce que le document désigne a été lu et compris, soit il est
 * refusé (`PdfIllisible`). Un PDF chiffré est refusé aussi : sa fiche est
 * chiffrée avec le reste, on ne saurait pas la lire pour la retirer.
 *
 * Aucune dépendance : le format est lu ici, et la décompression est celle de
 * Node.
 */

export type NettoyagePdf = {
	/** Le fichier reconstruit, prêt à être enregistré. */
	octets: Buffer;
	/** Ce qui a été retiré, en clair (« fiche du document », « XMP »…), pour les comptes rendus. */
	retire: string[];
	/**
	 * Le nom inscrit comme auteur, s'il y en avait un. Pour le compte rendu du
	 * script de maintenance seulement : il n'est enregistré nulle part.
	 */
	auteur: string;
	/** Une photo insérée dans le PDF contenait une position GPS. */
	position: boolean;
};

const MESSAGE_ILLISIBLE =
	"PDF illisible : le fichier semble abîmé ou d'un format inhabituel. Ouvrez-le et enregistrez-en une copie (Fichier → Exporter au format PDF, ou Imprimer → Enregistrer au format PDF), puis réessayez.";
const MESSAGE_PROTEGE =
	"Ce PDF est protégé (par un mot de passe ou des restrictions) : le site ne peut pas en retirer le nom de son auteur. Enregistrez-en une copie sans protection, puis réessayez.";

/**
 * Levée pour tout fichier dont la structure n'est pas entièrement comprise.
 * Le message s'adresse à la personne qui envoie le PDF ; `detail` dit, à qui
 * maintient le site, où la lecture s'est arrêtée.
 */
export class PdfIllisible extends Error {
	detail: string;
	constructor(detail: string, message = MESSAGE_ILLISIBLE) {
		super(message);
		this.detail = detail;
	}
}

function illisible(detail: string): never {
	throw new PdfIllisible(detail);
}

/** Les comptes rendus disent ce qui a été retiré avec ces mots-là. */
const FICHE = 'fiche du document';
const XMP = 'XMP';
const PIECES_JOINTES = 'pièces jointes';
const SIGNATURES = 'signatures';
const DATES = 'dates';
const AUTEURS_ANNOTATIONS = 'auteurs des commentaires';
const PHOTOS = 'métadonnées des photos';
const INUTILISES = 'objets inutilisés';

/**
 * Les clés coupées partout où on les trouve : aucune ne sert à l'affichage.
 * PieceInfo est un tiroir où chaque logiciel range ce qu'il veut (Illustrator
 * y met le fichier d'origine entier) ; Thumb, une miniature de la page faite
 * à un moment donné, qui peut montrer ce que la page affichait avant une
 * correction ; Perms, les droits liés à une signature, que la reconstruction
 * rend de toute façon invalide.
 */
const CLES_RETIREES = new Map([
	['Metadata', XMP],
	['PieceInfo', 'données privées des logiciels'],
	['LastModified', DATES],
	['Thumb', 'miniatures des pages'],
	['EmbeddedFiles', PIECES_JOINTES],
	['AF', PIECES_JOINTES],
	['Collection', PIECES_JOINTES],
	['Perms', SIGNATURES]
]);

/**
 * Les objets que l'on ne recopie pas, d'après leur /Type, même s'ils sont
 * désignés ailleurs. Les flux d'objets et les tables (ObjStm, XRef) sont la
 * structure de l'ancien fichier : le nouveau a la sienne.
 */
const OBJETS_RETIRES = new Map([
	['Metadata', XMP],
	['EmbeddedFile', PIECES_JOINTES],
	['Sig', SIGNATURES],
	['DocTimeStamp', SIGNATURES],
	['ObjStm', ''],
	['XRef', '']
]);

/**
 * Les commentaires et surlignages (« annotations de balisage ») : /T y est le
 * nom de la personne qui les a écrits. Dans un champ de formulaire (Widget),
 * /T est le nom du champ, et il reste.
 */
const ANNOTATIONS_BALISEES = new Set([
	...['Text', 'FreeText', 'Line', 'Square', 'Circle', 'Polygon', 'PolyLine'],
	...['Highlight', 'Underline', 'Squiggly', 'StrikeOut', 'Caret', 'Ink'],
	...['Stamp', 'FileAttachment', 'Sound', 'Redact', 'Projection']
]);

const PROFONDEUR_MAX = 200;
/** Plafond des données décompressées pour lire la structure : un fichier piégé ne doit pas remplir la mémoire. */
const DECOMPRESSION_MAX = 200 * 1024 * 1024;

/* ---------------------------------------------------------- les valeurs */

/*
 * Ce que contient un PDF, une fois lu : des nombres, des noms (/Type), des
 * textes, des tableaux, des dictionnaires, et des renvois vers d'autres
 * objets (« 12 0 R »). Les nombres et les textes sont gardés tels qu'ils sont
 * écrits : ils ressortent à l'identique.
 */
type Valeur =
	| { t: 'nombre'; texte: string }
	| { t: 'nom'; v: string }
	| { t: 'chaine'; brut: Buffer }
	| { t: 'tableau'; v: Valeur[] }
	| { t: 'dico'; v: Dico }
	| { t: 'ref'; num: number }
	| { t: 'mot'; v: 'true' | 'false' | 'null' };
type Dico = Map<string, Valeur>;

/** Un objet du fichier : sa valeur et, pour un flux, ses données brutes (encore compressées). */
type Objet = { valeur: Valeur; flux: Buffer | null };

const NUL: Valeur = { t: 'mot', v: 'null' };

function nomDe(v: Valeur | undefined): string {
	return v?.t === 'nom' ? v.v : '';
}

function entierDe(v: Valeur | undefined, quoi: string): number {
	if (v?.t !== 'nombre' || !/^\+?\d{1,15}$/.test(v.texte)) illisible(`${quoi} : nombre entier attendu`);
	return Number(v.texte);
}

/* ------------------------------------------------------------ la lecture */

const BLANCS = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIMITEURS = new Set([...'()<>[]{}/%'].map((c) => c.charCodeAt(0)));
const NOMBRE = /^[+-]?(\d+\.?\d*|\.\d+)$/;

function ordinaire(o: number): boolean {
	return !BLANCS.has(o) && !DELIMITEURS.has(o);
}

/** Lit des valeurs à partir d'une position, dans le fichier ou dans un flux décompressé. */
class Lecteur {
	src: Buffer;
	pos: number;

	constructor(src: Buffer, pos: number) {
		this.src = src;
		this.pos = pos;
	}

	/** Saute les blancs et les commentaires (de « % » à la fin de la ligne). */
	blancs() {
		const s = this.src;
		while (this.pos < s.length) {
			if (BLANCS.has(s[this.pos])) this.pos++;
			else if (s[this.pos] === 0x25) {
				while (this.pos < s.length && s[this.pos] !== 0x0a && s[this.pos] !== 0x0d) this.pos++;
			} else break;
		}
	}

	/** Un mot : un nombre ou un mot-clé (obj, stream, R…). */
	mot(): string {
		this.blancs();
		const debut = this.pos;
		while (this.pos < this.src.length && ordinaire(this.src[this.pos])) this.pos++;
		return this.src.toString('latin1', debut, this.pos);
	}

	attendre(motCle: string) {
		const lu = this.mot();
		if (lu !== motCle) illisible(`« ${motCle} » attendu, « ${lu.slice(0, 20)} » trouvé`);
	}

	entier(): number {
		const lu = this.mot();
		if (!/^\d{1,15}$/.test(lu)) illisible(`nombre entier attendu, « ${lu.slice(0, 20)} » trouvé`);
		return Number(lu);
	}

	valeur(profondeur = 0): Valeur {
		if (profondeur > PROFONDEUR_MAX) illisible('structure trop profonde');
		this.blancs();
		const s = this.src;
		if (this.pos >= s.length) illisible('fin inattendue');
		const o = s[this.pos];

		if (o === 0x2f) return { t: 'nom', v: this.nom() };
		if (o === 0x28) return { t: 'chaine', brut: this.chaine() };
		if (o === 0x5b) {
			this.pos++;
			const v: Valeur[] = [];
			for (;;) {
				this.blancs();
				if (s[this.pos] === 0x5d) {
					this.pos++;
					return { t: 'tableau', v };
				}
				v.push(this.valeur(profondeur + 1));
			}
		}
		if (o === 0x3c && s[this.pos + 1] === 0x3c) {
			this.pos += 2;
			const v: Dico = new Map();
			for (;;) {
				this.blancs();
				if (s[this.pos] === 0x3e && s[this.pos + 1] === 0x3e) {
					this.pos += 2;
					return { t: 'dico', v };
				}
				if (s[this.pos] !== 0x2f) illisible('clé de dictionnaire attendue');
				const cle = this.nom();
				v.set(cle, this.valeur(profondeur + 1));
			}
		}
		if (o === 0x3c) return { t: 'chaine', brut: this.hexa() };

		const mot = this.mot();
		if (mot === 'true' || mot === 'false' || mot === 'null') return { t: 'mot', v: mot };
		if (!NOMBRE.test(mot)) illisible(`« ${mot.slice(0, 20) || s.toString('latin1', this.pos, this.pos + 1)} » inattendu`);
		// Deux entiers suivis de R : un renvoi vers un autre objet.
		if (/^\d+$/.test(mot)) {
			const apres = this.pos;
			if (/^\d+$/.test(this.mot()) && this.mot() === 'R') return { t: 'ref', num: Number(mot) };
			this.pos = apres;
		}
		return { t: 'nombre', texte: mot };
	}

	/** Un nom, « #xx » résolus : /Metad#61ta est /Metadata. */
	nom(): string {
		this.pos++; // la barre oblique
		const debut = this.pos;
		while (this.pos < this.src.length && ordinaire(this.src[this.pos])) this.pos++;
		return this.src
			.toString('latin1', debut, this.pos)
			.replace(/#([0-9a-fA-F]{2})/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
	}

	/** Un texte entre parenthèses, qui peut en contenir d'autres, équilibrées ou précédées de « \ ». */
	chaine(): Buffer {
		const s = this.src;
		const debut = this.pos;
		let niveau = 0;
		for (; this.pos < s.length; this.pos++) {
			if (s[this.pos] === 0x5c) this.pos++;
			else if (s[this.pos] === 0x28) niveau++;
			else if (s[this.pos] === 0x29 && --niveau === 0) {
				this.pos++;
				return s.subarray(debut, this.pos);
			}
		}
		illisible('texte non terminé');
	}

	/** Un texte écrit en hexadécimal : <4361 6d69>. */
	hexa(): Buffer {
		const fin = this.src.indexOf(0x3e, this.pos);
		if (fin < 0) illisible('texte non terminé');
		const brut = this.src.subarray(this.pos, fin + 1);
		if (!/^<[0-9a-fA-F\0\t\n\f\r ]*>$/.test(brut.toString('latin1'))) illisible('texte hexadécimal invalide');
		this.pos = fin + 1;
		return brut;
	}
}

/* -------------------------------------------------------- la décompression */

/**
 * Décompresse un flux de structure (flux d'objets, table des objets). Seule
 * la compression « Flate » s'y rencontre en pratique ; les autres sont
 * refusées plutôt que mal lues.
 */
function decompresser(dico: Dico, brut: Buffer, budget: { reste: number }): Buffer {
	const filtre = dico.get('Filter');
	const filtres = filtre?.t === 'tableau' ? filtre.v.map(nomDe) : filtre ? [nomDe(filtre)] : [];
	if (filtres.length === 0) return brut;
	if (filtres.length !== 1 || filtres[0] !== 'FlateDecode') illisible(`compression ${filtres.join(' + ')} non prise en charge`);

	let donnees: Buffer;
	try {
		// Z_SYNC_FLUSH : comme les lecteurs de PDF, on accepte un flux dont la fin a été omise.
		donnees = inflateSync(brut, { finishFlush: constants.Z_SYNC_FLUSH, maxOutputLength: budget.reste });
	} catch {
		illisible('flux compressé abîmé ou démesuré');
	}
	budget.reste -= donnees.length;

	const parametres = dico.get('DecodeParms');
	const p = parametres?.t === 'tableau' ? parametres.v[0] : parametres;
	if (p?.t !== 'dico') return donnees;
	const predicteur = p.v.has('Predictor') ? entierDe(p.v.get('Predictor'), 'Predictor') : 1;
	if (predicteur === 1) return donnees;
	if (predicteur < 10) illisible(`prédicteur ${predicteur} non pris en charge`);
	const colonnes = p.v.has('Columns') ? entierDe(p.v.get('Columns'), 'Columns') : 1;
	const couleurs = p.v.has('Colors') ? entierDe(p.v.get('Colors'), 'Colors') : 1;
	const bits = p.v.has('BitsPerComponent') ? entierDe(p.v.get('BitsPerComponent'), 'BitsPerComponent') : 8;
	return sansPredicteur(donnees, colonnes, couleurs, bits);
}

/**
 * Défait le « prédicteur PNG » : chaque ligne commence par un octet qui dit
 * comment elle a été écrite par différence avec la précédente, ou avec
 * l'octet de gauche. Les tables d'objets compressées en usent presque
 * toujours.
 */
function sansPredicteur(d: Buffer, colonnes: number, couleurs: number, bits: number): Buffer {
	const parPixel = Math.max(1, Math.ceil((couleurs * bits) / 8));
	const largeur = Math.ceil((couleurs * bits * colonnes) / 8);
	if (largeur < 1) illisible('prédicteur : largeur nulle');
	const lignes = Math.floor(d.length / (largeur + 1));
	const sortie = Buffer.alloc(lignes * largeur);
	let precedente = Buffer.alloc(largeur);
	for (let i = 0; i < lignes; i++) {
		const filtre = d[i * (largeur + 1)];
		const entree = d.subarray(i * (largeur + 1) + 1, (i + 1) * (largeur + 1));
		const ligne = sortie.subarray(i * largeur, (i + 1) * largeur);
		for (let j = 0; j < largeur; j++) {
			const gauche = j >= parPixel ? ligne[j - parPixel] : 0;
			const dessus = precedente[j];
			const diagonale = j >= parPixel ? precedente[j - parPixel] : 0;
			let x = entree[j];
			if (filtre === 1) x += gauche;
			else if (filtre === 2) x += dessus;
			else if (filtre === 3) x += (gauche + dessus) >> 1;
			else if (filtre === 4) {
				const base = gauche + dessus - diagonale;
				const [a, b, c] = [Math.abs(base - gauche), Math.abs(base - dessus), Math.abs(base - diagonale)];
				x += a <= b && a <= c ? gauche : b <= c ? dessus : diagonale;
			} else if (filtre !== 0) illisible(`prédicteur : filtre ${filtre} inconnu`);
			ligne[j] = x & 0xff;
		}
		precedente = ligne;
	}
	return sortie;
}

/* ----------------------------------------------------- la table des objets */

/*
 * La fin d'un PDF dit où trouver sa table des objets (« startxref ») : pour
 * chaque numéro d'objet, sa position dans le fichier (type 1), ou le flux
 * d'objets compressé qui le contient et son rang dans ce flux (type 2), ou
 * rien (type 0, objet supprimé). La table est écrite en clair (« xref ») ou,
 * depuis 2003, elle-même compressée dans un flux. Chaque mise à jour du
 * fichier ajoute une table à la fin, qui renvoie à la précédente (/Prev) : la
 * plus récente l'emporte, objet par objet.
 */
type Entree = { type: 0 } | { type: 1; position: number } | { type: 2; flux: number; rang: number };

/** Désigne une version d'un objet dans le fichier, pour savoir lesquelles ont été recopiées. */
function cle(e: Entree): string {
	return e.type === 1 ? `o${e.position}` : e.type === 2 ? `f${e.flux}:${e.rang}` : '';
}

type FluxObjets = { donnees: Buffer; premier: number; positions: [number, number][] };

class Document {
	src: Buffer;
	/** La version la plus récente de chaque objet. */
	entrees = new Map<number, Entree>();
	/** Les « trailers », du plus récent au plus ancien : c'est là que sont désignés le catalogue et la fiche. */
	trailers: Dico[] = [];
	/** Toutes les versions de tous les objets présents dans le fichier. */
	versions = new Set<string>();
	/** Celles qui ne servaient qu'à la structure de l'ancien fichier : tables, flux d'objets, longueurs. */
	structure = new Set<string>();
	/** Celles des fiches Info, comptées à part. */
	fiches = new Set<string>();
	/** Les numéros des fiches Info, dans toutes les versions du fichier. */
	numerosFiches = new Set<number>();

	private objets = new Map<number, Objet>();
	private enCours = new Set<number>();
	private flux = new Map<number, FluxObjets>();
	private budget = { reste: DECOMPRESSION_MAX };

	constructor(src: Buffer) {
		this.src = src;
		const fin = src.lastIndexOf('startxref');
		if (fin < 0) illisible('table des objets introuvable');
		let position: number | null = new Lecteur(src, fin + 9).entier();
		const vues = new Set<number>();
		while (position !== null) {
			if (vues.has(position)) illisible('tables des objets en boucle');
			vues.add(position);
			const { entrees, trailer } = this.section(position);
			for (const [num, e] of entrees) {
				if (!this.entrees.has(num)) this.entrees.set(num, e);
				if (e.type !== 0) this.versions.add(cle(e));
			}
			const info = trailer.get('Info');
			if (info?.t === 'ref') {
				const ici = entrees.get(info.num);
				const actuelle = this.entrees.get(info.num);
				// Sauf si le numéro a été repris depuis par un autre objet.
				if (actuelle && (!ici || cle(ici) === cle(actuelle))) this.numerosFiches.add(info.num);
				for (const e of [ici, actuelle]) if (e) this.fiches.add(cle(e));
			}
			this.trailers.push(trailer);
			position = trailer.has('Prev') ? entierDe(trailer.get('Prev'), 'Prev') : null;
		}
	}

	/** Une table, en clair ou compressée, et le trailer qui la suit. */
	private section(position: number): { entrees: Map<number, Entree>; trailer: Dico } {
		if (position >= this.src.length) illisible('table des objets hors du fichier');
		const l = new Lecteur(this.src, position);
		if (l.mot() !== 'xref') return this.sectionCompressee(position);

		const entrees = new Map<number, Entree>();
		for (;;) {
			const mot = l.mot();
			if (mot === 'trailer') break;
			if (!/^\d{1,15}$/.test(mot)) illisible('table des objets abîmée');
			const premier = Number(mot);
			const nombre = l.entier();
			if (nombre * 18 > this.src.length - l.pos) illisible('table des objets tronquée');
			for (let i = 0; i < nombre; i++) {
				const decalage = l.entier();
				l.entier(); // numéro de génération : inutile ici
				const etat = l.mot();
				if (etat !== 'n' && etat !== 'f') illisible('table des objets abîmée');
				const num = premier + i;
				// Rien ne peut être à la position 0 : l'en-tête y est. Certains logiciels notent ainsi un objet absent.
				if (num === 0 || entrees.has(num)) continue;
				entrees.set(num, etat === 'n' && decalage > 0 ? { type: 1, position: decalage } : { type: 0 });
			}
		}
		const trailer = l.valeur();
		if (trailer.t !== 'dico') illisible('trailer abîmé');

		// Fichier « hybride » (Word en écrit) : une table en clair pour les
		// lecteurs anciens, une table compressée pour les objets rangés dans des
		// flux. Elle ne complète que les objets absents de la première : un objet
		// noté supprimé le reste, comme pour qpdf et le lecteur de Firefox.
		if (trailer.v.has('XRefStm')) {
			const cachee = this.sectionCompressee(entierDe(trailer.v.get('XRefStm'), 'XRefStm'));
			for (const [num, e] of cachee.entrees) {
				if (!entrees.has(num)) entrees.set(num, e);
			}
		}
		return { entrees, trailer: trailer.v };
	}

	/** Une table compressée : un flux dont chaque ligne fait la même largeur (/W). */
	private sectionCompressee(position: number): { entrees: Map<number, Entree>; trailer: Dico } {
		const l = new Lecteur(this.src, position);
		l.entier();
		l.entier();
		l.attendre('obj');
		const { valeur, flux } = this.corps(l);
		if (valeur.t !== 'dico' || nomDe(valeur.v.get('Type')) !== 'XRef' || !flux) illisible('table des objets introuvable');
		this.structure.add(`o${position}`);

		const largeurs = valeur.v.get('W');
		if (largeurs?.t !== 'tableau' || largeurs.v.length !== 3) illisible('table compressée : /W abîmé');
		const [w0, w1, w2] = largeurs.v.map((v) => entierDe(v, 'W'));
		if (w0 > 8 || w1 > 8 || w2 > 8 || w0 + w1 + w2 === 0) illisible('table compressée : colonnes abîmées');
		const index = valeur.v.get('Index');
		const plages =
			index?.t === 'tableau' ? index.v.map((v) => entierDe(v, 'Index')) : [0, entierDe(valeur.v.get('Size'), 'Size')];
		if (plages.length % 2) illisible('table compressée : /Index abîmé');

		const donnees = decompresser(valeur.v, flux, this.budget);
		const champ = (p: number, largeur: number) => {
			let v = 0;
			for (let i = 0; i < largeur; i++) v = v * 256 + donnees[p + i];
			return v;
		};
		const entrees = new Map<number, Entree>();
		let p = 0;
		for (let k = 0; k < plages.length; k += 2) {
			for (let i = 0; i < plages[k + 1]; i++) {
				if (p + w0 + w1 + w2 > donnees.length) illisible('table compressée tronquée');
				const type = w0 ? champ(p, w0) : 1;
				const a = champ(p + w0, w1);
				const b = champ(p + w0 + w1, w2);
				p += w0 + w1 + w2;
				const num = plages[k] + i;
				if (num === 0 || entrees.has(num)) continue;
				// Un type inconnu vaut un objet absent : c'est ce que prévoit la norme.
				entrees.set(num, type === 1 && a > 0 ? { type: 1, position: a } : type === 2 ? { type: 2, flux: a, rang: b } : { type: 0 });
			}
		}
		return { entrees, trailer: valeur.v };
	}

	/**
	 * Un objet, par son numéro, dans sa version la plus récente. Un renvoi vers
	 * un objet qui n'existe pas vaut « null » : c'est la règle du format.
	 */
	charger(num: number): Objet | null {
		const deja = this.objets.get(num);
		if (deja) return deja;
		const e = this.entrees.get(num);
		if (!e || e.type === 0) return null;
		if (this.enCours.has(num)) illisible(`objet ${num} défini par lui-même`);
		this.enCours.add(num);
		try {
			const objet = e.type === 1 ? this.objetA(e.position, num) : this.objetDansFlux(e.flux, e.rang, num);
			this.objets.set(num, objet);
			return objet;
		} finally {
			this.enCours.delete(num);
		}
	}

	private objetA(position: number, num: number): Objet {
		const l = new Lecteur(this.src, position);
		if (l.entier() !== num) illisible(`objet ${num} absent de la position annoncée`);
		l.entier();
		l.attendre('obj');
		return this.corps(l);
	}

	/**
	 * Ce qui suit « 12 0 obj » : une valeur, puis éventuellement les données
	 * d'un flux. Le « endobj » final n'est pas exigé : l'objet est complet
	 * avant lui, certains logiciels l'oublient, et rien de ce qui suit n'est
	 * recopié.
	 */
	private corps(l: Lecteur): Objet {
		const valeur = l.valeur();
		const avant = l.pos;
		if (l.mot() !== 'stream') {
			l.pos = avant;
			return { valeur, flux: null };
		}
		if (valeur.t !== 'dico') illisible('flux sans dictionnaire');

		// Après « stream », une fin de ligne, puis exactement /Length octets.
		let debut = l.pos;
		if (this.src[debut] === 0x0d) debut++;
		if (this.src[debut] === 0x0a) debut++;
		const longueur = this.longueur(valeur.v.get('Length'));
		if (debut + longueur > this.src.length) illisible('flux tronqué');
		// « endstream » juste après : c'est ce qui prouve que /Length dit vrai.
		l.pos = debut + longueur;
		l.attendre('endstream');
		return { valeur, flux: this.src.subarray(debut, debut + longueur) };
	}

	/** /Length est un nombre, ou un renvoi vers un objet qui contient ce nombre. */
	private longueur(v: Valeur | undefined): number {
		if (v?.t !== 'ref') return entierDe(v, 'Length');
		const objet = this.charger(v.num);
		const e = this.entrees.get(v.num);
		if (e) this.structure.add(cle(e));
		return entierDe(objet?.valeur, 'Length');
	}

	/** Un objet rangé dans un flux d'objets : on décompresse le flux, puis on lit l'objet à son rang. */
	private objetDansFlux(numFlux: number, rang: number, num: number): Objet {
		const flux = this.fluxObjets(numFlux);
		if (rang >= flux.positions.length || flux.positions[rang][0] !== num) {
			illisible(`objet ${num} absent de son flux d'objets`);
		}
		const l = new Lecteur(flux.donnees, flux.premier + flux.positions[rang][1]);
		return { valeur: l.valeur(), flux: null };
	}

	private fluxObjets(num: number): FluxObjets {
		const deja = this.flux.get(num);
		if (deja) return deja;
		const e = this.entrees.get(num);
		if (e?.type !== 1) illisible("flux d'objets introuvable");
		const objet = this.charger(num);
		if (objet?.valeur.t !== 'dico' || !objet.flux || nomDe(objet.valeur.v.get('Type')) !== 'ObjStm') {
			illisible("flux d'objets introuvable");
		}
		this.structure.add(cle(e));
		const nombre = entierDe(objet.valeur.v.get('N'), 'N');
		const premier = entierDe(objet.valeur.v.get('First'), 'First');
		const donnees = decompresser(objet.valeur.v, objet.flux, this.budget);
		if (nombre * 4 > donnees.length || premier > donnees.length) illisible("flux d'objets abîmé");
		// En tête du flux, des paires : numéro de l'objet, position après /First.
		const l = new Lecteur(donnees, 0);
		const positions: [number, number][] = [];
		for (let i = 0; i < nombre; i++) positions.push([l.entier(), l.entier()]);
		const lu = { donnees, premier, positions };
		this.flux.set(num, lu);
		return lu;
	}
}

/* -------------------------------------------------------- la reconstruction */

function estAnnotation(d: Dico): boolean {
	return d.has('Rect') && nomDe(d.get('Subtype')) !== '' && (!d.has('Type') || nomDe(d.get('Type')) === 'Annot');
}

/** Une image JPEG, recopiée telle quelle par Chrome ou macOS : elle peut garder sa position GPS. */
function estJpeg(d: Dico): boolean {
	const filtre = d.get('Filter');
	const filtres = filtre?.t === 'tableau' ? filtre.v.map(nomDe) : [nomDe(filtre)];
	return nomDe(d.get('Subtype')) === 'Image' && filtres.length === 1 && filtres[0] === 'DCTDecode';
}

class Reconstruction {
	doc: Document;
	retire = new Set<string>();
	position = false;

	/** Ancien numéro → nouveau. Les objets sont renumérotés dans l'ordre où on les rencontre. */
	private numeros = new Map<number, number>();
	private file: number[] = [];
	/** Les tableaux /Annots écrits comme objets à part : on en retire les pièces jointes. */
	private tableauxAnnotations = new Set<number>();
	private morceaux: Buffer[] = [];
	private taille = 0;
	private positions: number[] = [];
	ecrits = new Set<string>();

	constructor(doc: Document) {
		this.doc = doc;
	}

	/** Le nouveau numéro d'un objet, s'il est recopié ; null s'il n'existe pas ou qu'on le retire. */
	numero(ancien: number): number | null {
		const deja = this.numeros.get(ancien);
		if (deja !== undefined) return deja;
		// La fiche n'est jamais recopiée, même si un autre objet la désigne.
		if (this.doc.numerosFiches.has(ancien)) {
			this.retire.add(FICHE);
			return null;
		}
		const objet = this.doc.charger(ancien);
		if (!objet || this.aRetirer(objet.valeur)) return null;
		this.file.push(ancien);
		this.numeros.set(ancien, this.file.length);
		return this.file.length;
	}

	private aRetirer(v: Valeur): boolean {
		if (v.t !== 'dico') return false;
		const type = nomDe(v.v.get('Type'));
		let motif = OBJETS_RETIRES.get(type);
		if (motif === undefined && estAnnotation(v.v) && nomDe(v.v.get('Subtype')) === 'FileAttachment') motif = PIECES_JOINTES;
		// Une signature sans /Type : on la reconnaît à ce qu'elle signe.
		if (motif === undefined && v.v.has('ByteRange') && v.v.has('Contents') && v.v.has('Filter')) motif = SIGNATURES;
		if (motif === undefined) return false;
		if (motif) this.retire.add(motif);
		return true;
	}

	/**
	 * Recopie une valeur en suivant ses renvois. Rend null pour ce qui est
	 * retiré : la clé disparaît du dictionnaire, ou l'élément devient « null »
	 * dans un tableau - sauf dans /Annots, d'où il disparaît, une page ne
	 * listant que des annotations.
	 */
	private recopier(v: Valeur, dansAnnots = false): Valeur | null {
		if (v.t === 'ref') {
			const n = this.numero(v.num);
			return n === null ? null : { t: 'ref', num: n };
		}
		if (v.t === 'tableau') {
			const elements: Valeur[] = [];
			for (const x of v.v) {
				const copie = this.recopier(x);
				if (copie) elements.push(copie);
				else if (!dansAnnots) elements.push(NUL);
			}
			return { t: 'tableau', v: elements };
		}
		if (v.t !== 'dico') return v;
		if (this.aRetirer(v)) return null;

		const annotation = estAnnotation(v.v);
		const balisee = annotation && ANNOTATIONS_BALISEES.has(nomDe(v.v.get('Subtype')));
		const copie: Dico = new Map();
		for (const [nom, x] of v.v) {
			const motif =
				CLES_RETIREES.get(nom) ??
				(annotation && nom === 'M' ? DATES : undefined) ??
				(balisee && nom === 'CreationDate' ? DATES : undefined) ??
				(balisee && nom === 'T' ? AUTEURS_ANNOTATIONS : undefined);
			if (motif) {
				this.retire.add(motif);
				continue;
			}
			if (nom === 'Annots' && x.t === 'ref') this.tableauxAnnotations.add(x.num);
			const recopie = this.recopier(x, nom === 'Annots');
			if (recopie) copie.set(nom, recopie);
		}
		return { t: 'dico', v: copie };
	}

	/** Recopie, de proche en proche, tout ce que désigne le catalogue. */
	recopierTout(racine: number) {
		if (this.numero(racine) !== 1) illisible('catalogue absent');
		for (let i = 0; i < this.file.length; i++) {
			const ancien = this.file[i];
			const objet = this.doc.charger(ancien)!;
			this.ecrits.add(cle(this.doc.entrees.get(ancien)!));
			if (i === 0 && objet.valeur.t !== 'dico') illisible('catalogue absent');

			// La longueur d'un flux est récrite plus bas, en clair : l'objet qui la
			// contenait, s'il y en avait un, n'a pas à être recopié.
			let source = objet.valeur;
			if (objet.flux && source.t === 'dico') {
				source = { t: 'dico', v: new Map([...source.v].filter(([nom]) => nom !== 'Length')) };
			}
			const valeur = this.recopier(source, this.tableauxAnnotations.has(ancien)) ?? NUL;
			let flux = objet.flux;
			if (flux && valeur.t === 'dico') {
				if (estJpeg(valeur.v)) flux = this.photo(flux);
				valeur.v.set('Length', { t: 'nombre', texte: String(flux.length) });
			}
			this.ecrireObjet(i + 1, valeur, flux);
		}
	}

	private photo(jpeg: Buffer): Buffer {
		try {
			const propre = retirerMetadonnees(jpeg, 'image/jpeg');
			if (propre.retire.length) this.retire.add(PHOTOS);
			if (propre.position) this.position = true;
			return propre.octets;
		} catch (e) {
			if (e instanceof ImageIllisible) illisible(`photo illisible : ${e.detail}`);
			throw e;
		}
	}

	/* -------------------------------------------------------- l'écriture */

	private pousser(morceau: Buffer | string) {
		const b = typeof morceau === 'string' ? Buffer.from(morceau, 'latin1') : morceau;
		this.morceaux.push(b);
		this.taille += b.length;
	}

	private ecrireObjet(num: number, valeur: Valeur, flux: Buffer | null) {
		this.positions[num] = this.taille;
		this.pousser(`${num} 0 obj\n${ecrire(valeur)}\n`);
		if (flux) {
			this.pousser('stream\n');
			this.pousser(flux);
			this.pousser('\nendstream\n');
		}
		this.pousser('endobj\n');
	}

	/** L'en-tête, les objets recopiés, une table en clair, et un trailer qui ne désigne que le catalogue. */
	fichier(version: string): Buffer {
		const objets = this.morceaux;
		const entete = Buffer.from(`%PDF-${version}\n%\xe2\xe3\xcf\xd3\n`, 'latin1');
		this.morceaux = [entete, ...objets];
		this.positions = this.positions.map((p) => p + entete.length);
		this.taille += entete.length;

		const debutTable = this.taille;
		const nombre = this.file.length + 1;
		let table = `xref\n0 ${nombre}\n0000000000 65535 f\r\n`;
		for (let i = 1; i < nombre; i++) table += `${String(this.positions[i]).padStart(10, '0')} 00000 n\r\n`;
		this.pousser(table);
		this.pousser(`trailer\n<</Size ${nombre} /Root 1 0 R>>\nstartxref\n${debutTable}\n%%EOF\n`);
		return Buffer.concat(this.morceaux);
	}
}

/** Écrit une valeur comme le veut le format. */
function ecrire(v: Valeur): string {
	switch (v.t) {
		case 'nombre':
			return v.texte;
		case 'mot':
			return v.v;
		case 'nom':
			return '/' + ecrireNom(v.v);
		case 'chaine':
			return v.brut.toString('latin1');
		case 'ref':
			return `${v.num} 0 R`;
		case 'tableau':
			return `[${v.v.map(ecrire).join(' ')}]`;
		case 'dico':
			return `<<${[...v.v].map(([nom, x]) => `/${ecrireNom(nom)} ${ecrire(x)}`).join(' ')}>>`;
	}
}

/** Dans un nom, ce qui n'est pas une lettre, un chiffre ou un signe ordinaire s'écrit « #xx ». */
function ecrireNom(nom: string): string {
	let s = '';
	for (let i = 0; i < nom.length; i++) {
		const o = nom.charCodeAt(i);
		s += o > 0x20 && o < 0x7f && ordinaire(o) && o !== 0x23 ? nom[i] : '#' + o.toString(16).padStart(2, '0');
	}
	return s;
}

/* -------------------------------------------------------- l'auteur, en clair */

/** Les octets d'un texte PDF, échappements résolus. */
function octetsDuTexte(brut: Buffer): Buffer {
	if (brut[0] === 0x3c) {
		const hexa = brut.toString('latin1', 1, brut.length - 1).replace(/[^0-9a-fA-F]/g, '');
		return Buffer.from(hexa.length % 2 ? hexa + '0' : hexa, 'hex');
	}
	const sortie: number[] = [];
	const ECHAPPES: Record<number, number> = { 0x6e: 0x0a, 0x72: 0x0d, 0x74: 0x09, 0x62: 0x08, 0x66: 0x0c };
	for (let i = 1; i < brut.length - 1; i++) {
		if (brut[i] !== 0x5c) {
			sortie.push(brut[i]);
			continue;
		}
		const o = brut[++i];
		if (o >= 0x30 && o <= 0x37) {
			let code = 0;
			for (let n = 0; n < 3 && brut[i] >= 0x30 && brut[i] <= 0x37; n++) code = code * 8 + brut[i++] - 0x30;
			sortie.push(code & 0xff);
			i--;
		} else if (o === 0x0d) {
			if (brut[i + 1] === 0x0a) i++;
		} else if (o !== 0x0a) sortie.push(ECHAPPES[o] ?? o);
	}
	return Buffer.from(sortie);
}

/** Un texte PDF : en UTF-16 s'il commence par FE FF, en UTF-8 par EF BB BF, en Latin-1 à peu près sinon. */
function texte(brut: Buffer): string {
	const o = octetsDuTexte(brut);
	let s: string;
	if (o[0] === 0xfe && o[1] === 0xff) s = Buffer.from(o.subarray(2, 2 + ((o.length - 2) & ~1))).swap16().toString('utf16le');
	else if (o[0] === 0xef && o[1] === 0xbb && o[2] === 0xbf) s = o.subarray(3).toString('utf8');
	else s = o.toString('latin1');
	// Des caractères de contrôle dans un terminal peuvent le dérégler : on les retire.
	return s.replace(/\p{Cc}/gu, '').trim().slice(0, 200);
}

/** L'auteur inscrit dans la fiche, pour le compte rendu. La fiche n'est pas recopiée : la lire mal n'a pas d'autre effet. */
function auteurDe(doc: Document): string {
	try {
		const info = doc.trailers[0].get('Info');
		const fiche = info?.t === 'ref' ? doc.charger(info.num)?.valeur : info;
		let auteur = fiche?.t === 'dico' ? fiche.v.get('Author') : undefined;
		if (auteur?.t === 'ref') auteur = doc.charger(auteur.num)?.valeur;
		return auteur?.t === 'chaine' ? texte(auteur.brut) : '';
	} catch {
		return '';
	}
}

/* -------------------------------------------------------------- l'ensemble */

/**
 * Reconstruit le PDF sans sa fiche, son XMP, ses pièces jointes, ses
 * signatures, ses anciennes versions, et les métadonnées de ses photos.
 * `octets` a déjà été reconnu comme un PDF (`estPdf` de `bibliotheque.ts`).
 */
export function retirerMetadonneesPdf(octets: Buffer): NettoyagePdf {
	try {
		return reconstruire(octets);
	} catch (e) {
		if (e instanceof PdfIllisible) throw e;
		// Une lecture hors du fichier, une pile trop profonde : un fichier qu'on ne comprend pas.
		throw new PdfIllisible(`lecture impossible : ${e instanceof Error ? e.message : String(e)}`);
	}
}

function reconstruire(octets: Buffer): NettoyagePdf {
	const version = /^%PDF-([12]\.\d)/.exec(octets.toString('latin1', 0, 16))?.[1];
	if (!version) illisible('en-tête absent');
	const doc = new Document(octets);
	if (doc.trailers.some((t) => t.has('Encrypt'))) throw new PdfIllisible('PDF chiffré', MESSAGE_PROTEGE);
	const racine = doc.trailers[0].get('Root');
	if (racine?.t !== 'ref') illisible('catalogue absent');

	const r = new Reconstruction(doc);
	r.recopierTout(racine.num);

	if (doc.trailers.some((t) => t.has('Info'))) r.retire.add(FICHE);
	// Ce qui était dans le fichier sans être recopié : les fiches, comptées
	// plus haut, la structure de l'ancien fichier, et le reste - anciennes
	// versions des objets, objets que plus rien ne désignait.
	for (const version of doc.versions) {
		if (!r.ecrits.has(version) && !doc.structure.has(version) && !doc.fiches.has(version)) {
			r.retire.add(INUTILISES);
			break;
		}
	}
	return { octets: r.fichier(version), retire: [...r.retire], auteur: auteurDe(doc), position: r.position };
}
