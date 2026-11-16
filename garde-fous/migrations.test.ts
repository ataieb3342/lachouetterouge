import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { MIGRATIONS } from '../src/lib/server/db.ts';
import { lire } from './fichiers.ts';

/**
 * Une migration partie en production ne se modifie plus.
 *
 * Chaque migration ne s'exécute qu'une fois sur le serveur. La corriger après
 * coup ne change rien en production, mais donne une base différente à qui
 * installe le site demain : deux bases qui ne se ressemblent plus, et des
 * pannes impossibles à reproduire. Pour corriger, on ajoute une migration.
 *
 * `migrations.json` garde l'empreinte de chaque migration connue.
 *
 * VOUS AVEZ AJOUTÉ UNE MIGRATION, ET CE TEST ÉCHOUE ?
 * C'est normal : enregistrez son empreinte avec `npm run garde-fous:migrations`
 * (la commande n'ajoute que les nouvelles, elle ne réécrit jamais les
 * anciennes), et joignez le fichier à votre changement.
 */
const empreinte = (sql: string) => createHash('sha256').update(sql).digest('hex').slice(0, 16);
const connues: string[] = JSON.parse(lire('garde-fous/migrations.json'));

test('aucune migration déjà enregistrée n’a été modifiée, retirée ou déplacée', () => {
	assert.ok(MIGRATIONS.length >= connues.length, 'Des migrations ont été retirées de db.ts.');
	connues.forEach((attendue, i) => {
		assert.equal(
			empreinte(MIGRATIONS[i]),
			attendue,
			`La migration ${String(i + 1).padStart(3, '0')} a été modifiée. Rétablissez-la telle quelle et ajoutez une nouvelle migration à la fin.`
		);
	});
});

test('toute nouvelle migration a son empreinte enregistrée', () => {
	assert.equal(
		MIGRATIONS.length,
		connues.length,
		'Nouvelle migration sans empreinte : lancez `npm run garde-fous:migrations` et joignez garde-fous/migrations.json.'
	);
});
