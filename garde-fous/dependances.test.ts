import test from 'node:test';
import assert from 'node:assert/strict';
import { lire } from './fichiers.ts';

/**
 * Les dépendances du site en fonctionnement sont comptées.
 *
 * Chacune est une porte d'entrée possible et une mise à jour à suivre : une
 * dépendance compromise, c'est le site compromis. Elles étaient deux
 * (`markdown-it`, `qrcode`) ; quatre sont arrivées en novembre 2026 sans que
 * personne l'ait décidé.
 *
 * VOUS VOULEZ EN AJOUTER UNE, ET CE TEST ÉCHOUE ?
 * Demandez-vous d'abord si Node ne le fait pas déjà (`node:crypto`,
 * `node:sqlite`, `fetch`…) ou si vingt lignes de code ne suffisent pas. Si la
 * dépendance est vraiment nécessaire, ajoutez-la à la liste ci-dessous avec la
 * raison, dans le même changement, après en avoir parlé au propriétaire du dépôt.
 */
const APPROUVEES: Record<string, string> = {
	'markdown-it': 'le rendu des articles',
	qrcode: 'le QR code de la double authentification',
	sharp: 'les vignettes de la galerie de dessins (binaire natif : la seule exception)',
	mammoth: 'l’import des comptes rendus au format Word',
	yauzl: 'le contrôle de l’archive Word avant conversion',
	turndown: 'la conversion du HTML en Markdown (import Word, éditeur visuel)'
};

test('aucune dépendance nouvelle sans décision', () => {
	const paquet = JSON.parse(lire('package.json'));
	const presentes = Object.keys(paquet.dependencies ?? {}).sort();
	const nouvelles = presentes.filter((nom) => !(nom in APPROUVEES));
	assert.deepEqual(
		nouvelles,
		[],
		`Dépendance(s) non approuvée(s) : ${nouvelles.join(', ')}. Voir l’en-tête de garde-fous/dependances.test.ts.`
	);
	const disparues = Object.keys(APPROUVEES).filter((nom) => !presentes.includes(nom));
	assert.deepEqual(disparues, [], `Retirée(s) de package.json : ${disparues.join(', ')}. Retirez-la aussi de la liste.`);
});

test('les paquets viennent du registre npm, pas d’ailleurs', () => {
	const verrou = JSON.parse(lire('package-lock.json'));
	const ailleurs = Object.entries(verrou.packages as Record<string, { resolved?: string }>)
		.filter(([, paquet]) => paquet.resolved && !paquet.resolved.startsWith('https://registry.npmjs.org/'))
		.map(([nom]) => nom);
	assert.deepEqual(ailleurs, [], `Paquet(s) installé(s) depuis une autre source : ${ailleurs.join(', ')}.`);
});
