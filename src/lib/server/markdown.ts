// Le moteur de rendu est partagé avec l'éditeur visuel (`src/lib/markdown.ts`) :
// l'aperçu et les pages publiques appliquent exactement les mêmes règles. Ce
// fichier ne fait que le réexporter, pour les imports côté serveur.
export { renderMarkdown, toPlainText, escapeHtml } from '../markdown.ts';
