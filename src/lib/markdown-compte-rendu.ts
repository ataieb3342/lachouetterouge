import MarkdownIt from 'markdown-it';

/**
 * Le rendu des comptes rendus de réunion, partagé entre le serveur (la page
 * de lecture) et le navigateur (l'aperçu de l'éditeur) : les deux affichent
 * ainsi exactement la même chose.
 *
 * Comme pour les articles, `html: false` : le HTML écrit dans un compte rendu
 * est affiché tel quel, jamais interprété. Les images ne sont pas chargées
 * non plus - un compte rendu est du texte.
 *
 * Une particularité : les listes de tâches. Une ligne `- [ ] à faire` ou
 * `- [x] fait` devient une case à cocher, que l'équipe coche depuis la page
 * de lecture sans rouvrir l'éditeur.
 */
const markdown = new MarkdownIt({ html: false, linkify: true, breaks: true });

markdown.core.ruler.after('inline', 'taches_compte_rendu', (state) => {
	for (let i = 2; i < state.tokens.length; i++) {
		// Une tâche est le premier paragraphe d'un élément de liste.
		const texte = state.tokens[i];
		const dansUnElementDeListe =
			texte.type === 'inline' &&
			state.tokens[i - 1].type === 'paragraph_open' &&
			state.tokens[i - 2].type === 'list_item_open';
		if (!dansUnElementDeListe) continue;

		const marque = /^\[([ xX])\](?:\s+|$)/.exec(texte.content);
		const premier = texte.children?.[0];
		const ligne = state.tokens[i - 1].map?.[0];
		if (!marque || premier?.type !== 'text' || ligne === undefined) continue;

		// Le numéro de ligne dans le texte source identifie la case : c'est lui
		// que le formulaire renvoie quand on la coche.
		texte.meta = { ligneTache: ligne };
		premier.content = premier.content.slice(marque[0].length);
		state.tokens[i - 2].attrJoin('class', 'meeting-task');

		// Le seul HTML produit ici : il est construit par nous, et le libellé,
		// qui vient du texte, est échappé.
		const libelle = markdown.utils.escapeHtml(texte.content.slice(marque[0].length));
		const cochee = marque[1].toLowerCase() === 'x' ? ' checked' : '';
		const caseACocher = new state.Token('html_inline', '', 0);
		caseACocher.content = `<input type="checkbox" data-task-line="${ligne}" aria-label="${libelle}"${cochee}> `;
		texte.children!.unshift(caseACocher);
	}
});

// Une image n'est pas chargée : on dit seulement qu'il y en avait une.
markdown.renderer.rules.image = (tokens, index) =>
	`<span>Image : ${markdown.utils.escapeHtml(tokens[index].content)}</span>`;

export function rendreCompteRendu(texte: string): string {
	return markdown.render(texte);
}

/**
 * Coche ou décoche la tâche de la ligne donnée, et renvoie le texte modifié.
 * La ligne est revérifiée avec le même analyseur que le rendu : on ne modifie
 * que ce qui a réellement été affiché comme une case.
 */
export function cocherTache(texte: string, ligne: number, cochee: boolean): string {
	const taches = markdown.parse(texte, {}).filter((token) => token.meta?.ligneTache === ligne);
	if (!Number.isSafeInteger(ligne) || taches.length !== 1) {
		throw new Error('Case à cocher introuvable. Rechargez le compte rendu.');
	}

	const lignes = texte.split('\n');
	const motif = /^([\s>]*(?:[-+*]|\d+[.)])\s+)\[[ xX]\](?=\s|$)/;
	if (!motif.test(lignes[ligne])) throw new Error('Case à cocher introuvable.');
	lignes[ligne] = lignes[ligne].replace(motif, `$1[${cochee ? 'x' : ' '}]`);
	return lignes.join('\n');
}
