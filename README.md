# Site du groupe d'action LFI Dijon Centre

Site d'information : articles, actualités classées par catégorie, agenda
interactif, galerie collaborative de dessins, commentaires anonymes modérés
et administration protégée par double authentification.

- **Hébergement** : VPS français (OVH ou Scaleway), Docker + Caddy.
- **Données** : un fichier SQLite, les images et les PDF de la bibliothèque.
  Sauvegarder revient à copier `data/`.
- **Vie privée** : aucun cookie de mesure d'audience et aucune adresse IP
  conservée en clair.

## Démarrer en local

Node.js 24 minimum.

```bash
npm ci
npm run dev
```

Ouvrez http://localhost:5173. Au premier lancement, aucun compte n'existe : le
terminal affiche un **jeton d'installation** (également dans
`data/jeton-installation.txt`). Rendez-vous sur
http://localhost:5173/admin/installation, saisissez ce jeton et créez le premier
compte. Le jeton disparaît ensuite définitivement.

L'écran suivant impose l'activation de la double authentification : scannez le
QR code avec une application d'authentification (Aegis, Tofu, Bitwarden…).

## Structure

```
src/
  lib/server/      logique métier : base, comptes, contenus, images, anti-spam
  lib/components/  composants d'interface partagés
  routes/          pages publiques et administration
docker/            compose.yml et configuration Caddy
scripts/           sauvegarde et restauration
```

## Au quotidien

| Je veux… | Où |
| --- | --- |
| Écrire un article ou un compte rendu | Administration → Publications → Nouvelle publication → Article |
| Ajouter un rendez-vous | Choisir directement « Événement », « Formation » ou « Apéro thématique » |
| Mettre une publication à la une | Sur une publication en ligne, choisir « Enregistrer et mettre à la une » ; gérer l’ordre et le retrait dans Administration → À la une |
| Consulter les rendez-vous | Agenda : navigation par mois et filtres par catégorie |
| Retrouver mes articles en cours | Administration → Relecture → Mes articles en cours |
| Relire l’article de quelqu’un d’autre | Administration → Relecture → À relire |
| Relire les commentaires reçus | Administration → Commentaires |
| Relire les sources proposées pour un apéro | Administration → Sources des apéros |
| Consulter les ressources validées | Bibliothèque |
| Ajouter un jeu | Déposer son dossier dans `src/lib/jeux/` et l'ajouter à `src/lib/jeux.ts` |
| Ajouter ou importer un compte rendu de réunion interne | Administration → Comptes rendus de réunions |
| Proposer un dessin sans compte | Dessins → Proposer un dessin |
| Vérifier les dessins reçus | Administration → Dessins → Propositions à vérifier |
| Ajouter une image | Administration → Images |
| Ajouter un média recommandé, choisir ceux de l'accueil | Administration → Médias recommandés |
| Changer le nom du site, l'adresse de contact | Administration → Réglages |
| Ouvrir ou fermer les commentaires du site | Administration → Réglages |
| Mettre les liens de l'application Action populaire | Administration → Réglages |
| Ajouter un compte à quelqu'un | Administration → Comptes (rôle « responsable ») |
| Changer mon mot de passe, mon téléphone | Administration → Mon compte |

Les publications se rédigent directement dans leur mise en page. Cliquez dans
un paragraphe pour écrire. Ajoutez une image ou une bulle, puis déplacez chaque
élément avec sa poignée ou les boutons Remonter et Descendre. Le texte s'adapte
autour. Un clic sur l'élément donne accès à son placement et à sa largeur, au
cadrage d'une image ou à la couleur d'une bulle. Enregistrez la publication
pour conserver les modifications.

En mode Markdown, les outils sont regroupés en historique, texte et insertion.
Le volet « Police et couleur » rassemble les réglages complémentaires.

Les boutons « Markdown » et « Visuel » permettent de changer de mode sans
perdre le contenu. « Garder avec le bloc suivant » associe une image ou une
bulle au paragraphe qui suit ; plusieurs éléments consécutifs peuvent ainsi
rester ensemble. Les groupes ne traversent pas les titres ou les tableaux.
L'option « Voile parchemin » ajoute un lavis discret derrière une image,
sans modifier son fichier. Ces deux options sont désactivées par défaut.
Le choix « Type de bulle » propose Simple, Parole avec pointe à gauche ou à droite,
et Pensée. La forme Simple reste celle des anciennes bulles. « Rapprocher de
l’image » rapproche une bulle de parole placée après une image dans un même
groupe, sur grand écran. La pointe suit la bulle, sans modifier le dessin. « Petite bulle » réduit
la taille du texte et les marges intérieures pour cet élément seulement.
« Décaler les bulles liées » place les répliques liées sur des lignes successives,
en respectant leur ordre dans le Markdown.
Les anciens articles restent compatibles. Le HTML brut n'est pas interprété.

Les événements, formations et apéros peuvent partager une même date : chaque
fiche reste distincte dans les rubriques et dans l’agenda. Ils disposent de
leurs propres horaires, lieu, adresse, point de rendez-vous, responsables et
lien d’inscription. Pour un apéro, les informations propres à la fiche priment
sur le lieu et l’horaire habituels définis dans les réglages ; ces derniers ne
servent que de valeurs de repli.

## Relecture des articles

Un article n’est mis en ligne qu’après avoir été relu par une deuxième
personne. Les événements, formations et apéros ne sont pas concernés : ils se
publient directement.

Un article passe par quatre étapes, affichées en tête de sa fiche, avec un seul
bouton à chaque fois :

1. **Rédaction** - l’auteur écrit. Quand le texte est prêt : « Enregistrer et
   envoyer en relecture ». Tant qu’il ne l’a pas envoyé, lui seul peut le
   modifier.
2. **Relecture** - une autre personne de l’équipe lit le texte, corrige ce
   qu’elle veut, puis clique sur « Enregistrer et valider ». Si quelque chose
   doit être repris par l’auteur : « Demander des corrections », avec un mot
   qui dit quoi. L’article repart alors en rédaction.
3. **Validé** - l’auteur clique sur « Enregistrer et mettre en ligne ». C’est
   lui qui décide du moment.
4. **En ligne** - toute l’équipe peut corriger une coquille. « Retirer du
   site… » le remet en brouillon ; il devra être relu de nouveau.

Chaque bouton enregistre le texte avant de faire avancer l’article : on ne
perd jamais ce qu’on vient d’écrire. Corriger un texte déjà validé ne retire
pas la validation. On peut laisser un mot à tout moment (« Laisser un mot »),
et l’historique de la fiche garde la trace de tout.

**Administration → Relecture** rassemble ce qui vous attend : les articles des
autres à relire, puis vos propres articles en cours, avec ce qu’il leur
manque. Le chiffre à côté de « Relecture » dans le menu est le nombre
d’articles à relire.

En cas d’urgence, ou si l’auteur d’un article n’est plus là, le propriétaire
du site peut mettre un article en ligne sans relecture. C’est inscrit au
journal.

## Comptes rendus de réunions internes

Administration → Comptes rendus de réunions est réservée aux administrateurs
connectés avec la double authentification activée. Un titre et une date
permettent de classer les comptes rendus et de les retrouver par recherche.

Importez un fichier `.docx` (10 Mo maximum) ou `.md` (1 Mo maximum).
Les anciens fichiers Word `.doc` ne sont pas pris en charge.
La sélection d’un fichier remplit directement l’éditeur et remplace le modèle.
Le texte peut être corrigé et prévisualisé avant l’enregistrement ; le fichier
original est conservé à l’identique. La lecture préalable ne crée aucun compte rendu.
Il est aussi possible d’écrire directement en Markdown. Les titres,
liens et listes peuvent être insérés avec les mêmes boutons que dans les
publications. « Case à cocher » ajoute une tâche et « Aperçu » affiche le
rendu avant enregistrement. Le bouton « Utiliser le modèle », disponible
quand le texte est vide, propose les rubriques participants, points discutés,
décisions et actions à mener. L'import d'un fichier reste facultatif.

Les tâches `- [ ]` et `- [x]`
deviennent des cases cliquables : chaque changement est enregistré dans le
texte du compte rendu, sans modifier l'original. Si une autre personne a
modifié le document entre-temps, rechargez-le avant de recommencer.

Le texte importé est consultable et modifiable dans cette rubrique. La mise
en page Word est simplifiée ; les images et pièces jointes restent dans
l'original. Les images mentionnées dans le Markdown ne sont pas chargées.
L'original peut être téléchargé uniquement après connexion ; modifier le
texte du compte rendu ne modifie pas ce fichier initial.

Les documents sont conservés dans `data/uploads/.meeting-reports/`, inclus
dans les sauvegardes de `uploads`. Ils ne passent jamais par la médiathèque
publique et ne figurent ni dans les articles, ni dans le RSS ou le plan du
site. Les pages et les téléchargements sont privés et ne sont pas mis en
cache. La suppression d'un compte rendu supprime également son original.
Les créations, modifications et suppressions sont inscrites dans le journal
d'administration. Les modifications simultanées sont détectées pour éviter
d'écraser le travail d'une autre personne.

## Galerie collaborative de dessins

La page `/dessins` réunit les dessins et caricatures acceptés. Chacun peut
proposer une image depuis `/dessins/proposer`, sans compte ni adresse e-mail.
Le formulaire demande un titre, un nom ou pseudonyme, une description
accessible, les conditions de partage et une confirmation de l'autorisation
de publication et de téléchargement. Une légende peut être ajoutée.
Les fichiers JPEG, PNG, WebP, GIF et AVIF sont acceptés, jusqu'à 5 Mo.

Chaque proposition attend une vérification. Son fichier est conservé dans
`data/uploads/.drawing-submissions/`, sans adresse publique. Seuls les
administrateurs connectés avec la double authentification activée peuvent
le consulter. Le menu Dessins de l'administration indique le nombre de
propositions en attente. L'équipe peut corriger la fiche, puis choisir
« Accepter et publier » ou confirmer son refus. Un refus supprime la
proposition et son fichier privé ; les décisions sont inscrites dans le
journal d'administration. Aucun accusé de décision n'est envoyé par e-mail.

Après acceptation, le dessin rejoint la galerie avec sa signature et ses
conditions de partage. L'original devient téléchargeable. La galerie utilise
des vignettes WebP de 640 pixels maximum, sans recadrage, créées par Sharp
et mises en cache dans `data/uploads/.thumbnails/`. Un clic ouvre un lecteur
avec zoom, navigation précédent/suivant et fermeture par Échap.

Les administrateurs peuvent aussi ajouter directement un dessin, modifier une
fiche publiée ou la remettre en brouillon. Ce brouillon masque la fiche de la
galerie, mais ne rend pas privé un fichier déjà publié dans la médiathèque.
Supprimer une fiche conserve son image dans Administration → Images.

Les envois publics utilisent les mêmes protections anti-spam que les autres
contributions : champ-piège, preuve de travail locale et quotas par empreinte
d'IP. Aucun service extérieur n'est contacté. La file est limitée à 100
propositions. En fonctionnement normal, un visiteur peut envoyer jusqu'à cinq
propositions par jour ; sans preuve de travail valide, un envoi par jour est
accepté. Les images sont vérifiées par leurs octets et décodées avant stockage.

Le dossier `data/` doit être sauvegardé avec les fichiers cachés des envois en
attente. Le script `scripts/sauvegarde.sh` les inclut. Les dessins d'exemple de
l'aperçu local sont dans des données ignorées par Git et ne sont pas déployés.

## Navigation et agenda

La navigation publique donne directement accès à l’agenda, aux articles et aux dessins.
Le menu « Ressources » ouvre la bibliothèque ; sa flèche donne aussi accès à
la boîte à outils, aux jeux et aux médias. L’agenda rassemble les événements,
formations et apéros, avec une navigation par mois et des filtres par catégorie.

## Site de démonstration

Pour faire tester le site gratuitement avec des contenus fictifs, voir
**[DEMO.md](DEMO.md)**.

## Mise en production

Voir **[DEPLOIEMENT.md](DEPLOIEMENT.md)**.

## Proposer une modification

**On ne pousse pas directement sur `main`** : la branche est protégée, parce
qu'elle part en production en cinq minutes. Pour proposer un changement :

1. Créer une branche (`git switch -c ma-modification`).
2. Faire le changement, puis lancer `npm run verifier` : il doit passer.
3. Pousser la branche et ouvrir une demande de fusion (pull request) sur
   GitHub. Les vérifications y tournent toutes seules ; tant qu'elles
   échouent, la fusion est impossible.
4. La demande est relue et approuvée par le propriétaire du dépôt, puis
   fusionnée.

Les règles du projet sont dans trois fichiers :

- **[CLAUDE.md](CLAUDE.md)** - l'architecture, les conventions, les règles de
  sécurité, et la raison de chaque choix. Claude Code le lit automatiquement.
- **[AGENTS.md](AGENTS.md)** - le résumé impératif, lu par les autres
  assistants de code (ChatGPT, Codex…).
- **[CHARTE.md](CHARTE.md)** - à quoi ressemble une page et où elle se range.

Le dossier `garde-fous/` contient des tests qui échouent quand une de ces
règles est cassée (une rubrique de plus dans l'en-tête, une dépendance
nouvelle, une couleur hors charte…). Leur message dit quoi faire. On ne les
modifie pas pour les faire passer.

```bash
npm run verifier                                          # tout ce qu'il faut avant de proposer
node tests/integration/drawings-http.mjs                  # parcours complets, après compilation
node --test src/lib/jeux/mythology-rts/tests/*.test.js    # le jeu de stratégie, à part
```

Les jeux sont des applications JavaScript autonomes, exclues du contrôle
TypeScript/Svelte du site : le jeu de stratégie a sa propre suite de tests.
