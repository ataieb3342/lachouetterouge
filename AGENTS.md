# Consignes pour les assistants de code (ChatGPT, Codex, Claude…)

Ce dépôt est le site de La chouette rouge, un collectif militant
indépendant. Il est en production, et c'est une cible politique. **Lis `CLAUDE.md` en entier avant de modifier quoi que ce
soit** : il explique chaque choix. Ce fichier-ci n'en est que le résumé
impératif.

## Avant de proposer un changement

1. `npm run verifier` doit passer (vérification TypeScript, tests, garde-fous,
   compilation). **Ne pousse jamais, et ne propose jamais de pousser, sans
   l'avoir lancé** : `main` part en production en cinq minutes.
2. Si une vérification échoue, corrige le changement - pas le test. Explique à
   la personne avec qui tu travailles ce que le garde-fou protège.
3. Après chaque envoi, GitHub relance ces vérifications. En cas d'échec, le
   propriétaire du dépôt est prévenu par courriel.

## Ce qu'on ne fait pas

- **Rien qui rattache le site à un parti, un candidat ou une campagne
  électorale** : ni nom, ni logo, ni lien vers un site de candidat, ni appel à
  voter. Le site a été fermé une fois pour cela (voir le début de `CLAUDE.md`).
- **Pas de nouvelle rubrique dans l'en-tête.** La navigation est décidée dans
  `src/lib/structure.ts`, qui est verrouillé. Une nouvelle page va dans le
  menu Ressources ou dans le pied de page. Pas de nouveau type de publication :
  un nouveau genre de texte est un format d'article (actu, article, série).
- **Pas de nouvelle dépendance** sans décision (`garde-fous/dependances.test.ts`).
- **On ne modifie jamais une migration existante** de `db.ts` : on en ajoute
  une à la fin, puis `npm run garde-fous:migrations`.
- **On ne touche pas aux règles de sécurité** de `CLAUDE.md` : `html: false`,
  la CSP, aucune ressource chargée depuis un autre site, pas de SVG envoyé,
  toute image passe par `storeUpload`, toute action destructrice par `audit()`.
- **On ne modifie pas un test du dossier `garde-fous/` pour le faire passer.**
  S'il échoue, c'est le changement qu'il faut revoir.

## Comment on écrit

- **Tout en français** : noms de fichiers, de fonctions, de variables,
  d'actions de formulaire, commentaires, messages d'erreur.
- Indentation par tabulations, une instruction par ligne, des lignes lisibles.
- Chaque fichier commence par un commentaire qui dit ce qu'il fait et
  **pourquoi** ; chaque contrôle dit quelle erreur il évite. Ceux qui
  reprendront ce code sont des militants, pas des développeurs.
- Les couleurs, les marges et les gabarits de page sont ceux de la section
  « Direction artistique » de `CLAUDE.md` : pas de couleur Tailwind hors
  palette (`bg-red-50`…), pas de nouvelle valeur de marge.
