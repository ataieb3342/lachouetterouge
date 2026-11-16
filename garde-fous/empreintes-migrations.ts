import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MIGRATIONS } from '../src/lib/server/db.ts';

/**
 * Enregistre l'empreinte des migrations ajoutées depuis la dernière fois
 * (`npm run garde-fous:migrations`).
 *
 * N'ajoute que les nouvelles : une empreinte déjà enregistrée n'est jamais
 * réécrite, sinon le garde-fou ne garderait plus rien. Si une ancienne
 * migration a changé, la commande refuse - c'est la migration qu'il faut
 * rétablir.
 */
const chemin = join(import.meta.dirname, 'migrations.json');
const empreinte = (sql: string) => createHash('sha256').update(sql).digest('hex').slice(0, 16);
const connues: string[] = JSON.parse(readFileSync(chemin, 'utf8'));

connues.forEach((attendue, i) => {
	if (empreinte(MIGRATIONS[i] ?? '') !== attendue) {
		console.error(`La migration ${String(i + 1).padStart(3, '0')} a été modifiée : rétablissez-la avant de continuer.`);
		process.exit(1);
	}
});

const nouvelles = MIGRATIONS.slice(connues.length).map(empreinte);
writeFileSync(chemin, JSON.stringify([...connues, ...nouvelles], null, '\t') + '\n');
console.log(nouvelles.length ? `${nouvelles.length} empreinte(s) ajoutée(s).` : 'Rien de nouveau.');
