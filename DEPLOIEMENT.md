# Mise en production

Cible : un VPS français chez **OVH** ou **Scaleway** (environ 5 €/mois, la plus
petite offre suffit largement). Les deux incluent une protection anti-déni de
service en amont, ce qui est le point important pour un site politique : la
majorité des « attaques » subies par les sites militants sont des saturations,
pas des piratages.

## 1. Préparer le serveur

**Debian 13**, en root. Sur une image OVH, on se connecte d'abord avec
l'utilisateur `debian`, puis `sudo -i` - le mot de passe initial est envoyé par
courriel et le système impose de le changer à la première connexion.

Le nom du paquet Compose change d'une distribution à l'autre : c'est
`docker-compose` sur Debian 13 (Compose v2, greffon `docker compose`),
`docker-compose-v2` sur Ubuntu 24.04. **Debian 12 ne convient pas** : elle n'a
que Compose v1, abandonné depuis 2023.

```bash
apt update && DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a apt upgrade -y
apt install -y docker.io docker-compose git ufw unattended-upgrades

# Vérification : doit afficher « Docker Compose version v2.… »
docker compose version

# Mises à jour de sécurité automatiques
dpkg-reconfigure -plow unattended-upgrades

# Pare-feu : rien d'ouvert sauf SSH et le web
ufw default deny incoming
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

Durcir l'accès SSH - dans `/etc/ssh/sshd_config` :

```
PasswordAuthentication no
PermitRootLogin prohibit-password
```

puis `systemctl restart ssh`. **Vérifiez que votre clé SSH fonctionne dans un
second terminal avant de fermer le premier.**

## 2. Faire pointer le nom de domaine

Chez votre registrar, créez un enregistrement `A` vers l'adresse IPv4 du
serveur, pour le domaine et pour `www`. **Pas d'enregistrement `AAAA`** : le
site ne se sert qu'en IPv4, sans quoi il ne distingue plus ses visiteurs IPv6
(voir « Les vagues de requêtes » dans CLAUDE.md). Attendez que `dig +short votre-domaine.fr`
renvoie la bonne adresse avant de continuer : Caddy a besoin que le domaine
résolve pour obtenir le certificat HTTPS.

## 3. Installer le site

```bash
mkdir -p /srv && cd /srv
git clone <adresse-du-dépôt> lachouetterouge
cd lachouetterouge

cp .env.example .env
```

Éditez `.env` :

```bash
# Générez la clé et collez-la :  openssl rand -base64 48
SECRET_KEY=…

ORIGIN=https://votre-domaine.fr
SITE_DOMAIN=votre-domaine.fr
ADMIN_EMAIL=contact@votre-domaine.fr

DATABASE_PATH=/app/data/site.db
UPLOADS_PATH=/app/data/uploads
BIBLIOTHEQUE_PATH=/app/data/bibliotheque
ADDRESS_HEADER=X-Forwarded-For
XFF_DEPTH=1
BODY_SIZE_LIMIT=60M
PORT=3000
NODE_ENV=production
```

Deux variables méritent une explication :

- **`SECRET_KEY`** protège les sessions, les secrets de double authentification
  et la pseudonymisation des adresses IP. Sauvegardez-la avec vos données : la
  perdre invalide toutes les 2FA. La changer déconnecte tout le monde.
- **`ORIGIN`** doit correspondre exactement à l'adresse publique. Sans elle,
  SvelteKit rejette tous les envois de formulaire (protection anti-CSRF).

Puis :

```bash
chmod 600 .env
docker compose -f docker/compose.yml up -d --build
```

## 4. Créer le premier compte

```bash
docker compose -f docker/compose.yml logs site | grep -A2 "AUCUN COMPTE"
```

Le jeton d'installation s'affiche. Ouvrez `https://votre-domaine.fr/admin/installation`,
saisissez-le, créez votre compte, activez la double authentification.

Cette page se ferme définitivement dès que le premier compte existe.

## 5. Sauvegardes

```bash
crontab -e
```

```
30 4 * * * cd /srv/lachouetterouge && ./scripts/sauvegarde.sh >> /var/log/sauvegarde-site.log 2>&1
```

**Copiez les archives ailleurs.** Une sauvegarde qui ne vit que sur la machine
sauvegardée ne protège de rien. Un `rsync` nocturne vers un poste du groupe, ou
vers un espace de stockage chez un autre hébergeur, suffit.

Pour restaurer : `./scripts/restauration.sh sauvegardes/site-….tar.gz`

## 6. Mettre à jour le site

**C'est automatique.** `scripts/deployer.sh` tourne toutes les cinq minutes
(`/etc/cron.d/deploiement-site`) : il regarde si `main` a bougé et, seulement
dans ce cas, sauvegarde, récupère le code et redémarre. Pousser sur `main`
suffit donc à mettre le site à jour.

```bash
# Installation, une seule fois :
cat > /etc/cron.d/deploiement-site <<'FIN'
SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
*/5 * * * * root /srv/lachouetterouge/scripts/deployer.sh >> /var/log/deploiement-site.log 2>&1
FIN

# Pour déployer tout de suite sans attendre, ou pour voir ce qui se passe :
ssh lfi '/srv/lachouetterouge/scripts/deployer.sh'

# Ce qu'ont donné les derniers passages :
ssh lfi 'tail -30 /var/log/deploiement-site.log'
```

Quatre choses que le script gère et qu'on oublie en le faisant à la main : la
**sauvegarde préalable** (une migration ne se rejoue pas à l'envers), le
**verrou** (une compilation dure plus de cinq minutes, cron relancerait par
dessus), la **recréation du conteneur Caddy** quand `docker/Caddyfile` a
changé - le fichier est monté dans le conteneur, qui garde l'ancien sinon -,
et le **ménage** des anciennes images et du cache de compilation, qui sinon
s'accumulent jusqu'à remplir le disque.

**Tout dossier ajouté dans `/srv/lachouetterouge` sur le serveur doit figurer dans
`.dockerignore`.** Ce dossier est ce que Docker reçoit pour compiler. Le
19 octobre 2026, le disque de 40 Go était plein : les sauvegardes et les
preuves de l'attaque, qui n'y figuraient pas, étaient recopiées dans la
compilation à chaque mise à jour, et Docker gardait chaque copie en cache. Le
site a cessé de se mettre à jour et de se sauvegarder sans que rien ne le
signale. Pour vérifier la place libre : `ssh lfi 'df -h /'`.

Si la compilation échoue, les conteneurs en place continuent de servir la
version précédente : un commit cassé ne coupe pas le site, il empêche
seulement la mise à jour. Le journal le dit.

Les migrations de base de données s'appliquent toutes seules au démarrage.

## 7. Nettoyer les images envoyées avant le 23 octobre 2026 (une seule fois)

Jusqu'au 23 octobre 2026, le site enregistrait les images telles qu'elles
arrivaient. Or une photo prise au téléphone garde en elle l'endroit exact où
elle a été prise (sa position GPS), la date et l'heure, et le modèle du
téléphone : n'importe quel visiteur pouvait les lire en enregistrant l'image.
Depuis, chaque image est nettoyée au moment de l'envoi. Celles qui étaient déjà
en ligne doivent l'être une fois, avec `scripts/nettoyer-images.sh`.

Quand la mise à jour est arrivée sur le serveur (cinq minutes après avoir été
poussée sur `main`) :

```bash
# 1. Une sauvegarde d'abord : le nettoyage ne se défait pas.
ssh lfi '/srv/lachouetterouge/scripts/sauvegarde.sh'

# 2. Un essai : la liste de ce qui serait nettoyé. Rien n'est modifié.
ssh lfi '/srv/lachouetterouge/scripts/nettoyer-images.sh'

# 3. Le nettoyage, si la liste de l'essai convient.
ssh lfi '/srv/lachouetterouge/scripts/nettoyer-images.sh --appliquer'
```

Le site reste en ligne pendant l'opération : chaque image est remplacée d'un
coup, un visiteur reçoit l'ancienne ou la nouvelle, jamais une image cassée.
Les noms de fichiers ne changent pas, les publications n'ont donc rien à
reprendre. Chaque image nettoyée est notée dans le journal d'audit
(`image.nettoyage`). Relancer le script ne change rien aux images déjà propres.

Ce que dit le compte rendu :

- **`POSITION GPS`** au bout d'une ligne : cette image indiquait l'endroit où
  elle a été prise, et cet endroit était public. La plupart du temps c'est le
  lieu d'une action, déjà annoncé. Mais si une photo a été prise chez
  quelqu'un, il faut le lui dire.
- **Illisibles, laissées telles quelles** : le script ne comprend pas le
  fichier en entier et n'y touche pas plutôt que de le nettoyer à moitié.
  Elles gardent donc leurs métadonnées : réenregistrer l'image depuis
  l'original, l'envoyer de nouveau, la mettre à la place de l'ancienne, puis
  supprimer l'ancienne dans Administration → Images.
- **Absentes du disque** : une image inscrite en base dont le fichier a
  disparu. Rien à nettoyer ; elle s'affiche déjà cassée sur le site.

Ce que le script ne peut pas faire :

- **Les sauvegardes** contiennent les images d'origine, avec leurs
  métadonnées. Celles du serveur disparaissent d'elles-mêmes au bout de
  trente jours, celle de l'étape 1 comprise. Les copies faites ailleurs
  (sur un poste du groupe) les gardent tant qu'on ne les supprime pas.
- **Les copies déjà faites** : quelqu'un qui a enregistré une image, ou un
  moteur de recherche qui l'a gardée en mémoire, conserve la version
  d'origine.

Pourquoi un `.sh` : le conteneur du site ne contient que le site compilé, pas
le code source. Le script lance un conteneur jetable tiré de la même image,
avec les mêmes données et le même utilisateur, et lui prête le code source en
lecture seule le temps du nettoyage.

## 8. Nettoyer les PDF déposés avant le 24 octobre 2026 (une seule fois)

Jusqu'au 24 octobre 2026, les PDF proposés depuis une fiche d'apéro étaient
enregistrés tels qu'ils arrivaient. Or un PDF exporté de Word, de LibreOffice
ou de Pages porte dans ses propriétés le nom de la personne qui l'a écrit
(celui de son compte sur l'ordinateur, souvent son vrai nom), le logiciel, et
les dates de création à la seconde. Une photo insérée dans un document exporté
par Chrome ou par l'impression de macOS y garde aussi sa position GPS. Une fois
le PDF publié dans la bibliothèque, n'importe quel visiteur pouvait le lire
dans Fichier → Propriétés. Depuis, chaque PDF est nettoyé au moment de l'envoi.
Ceux qui étaient déjà déposés doivent l'être une fois, avec
`scripts/nettoyer-pdf.sh`.

Quand la mise à jour est arrivée sur le serveur (cinq minutes après avoir été
poussée sur `main`) :

```bash
# 1. Une sauvegarde d'abord : le nettoyage ne se défait pas.
ssh lfi '/srv/lachouetterouge/scripts/sauvegarde.sh'

# 2. Un essai : la liste de ce qui serait nettoyé. Rien n'est modifié.
ssh lfi '/srv/lachouetterouge/scripts/nettoyer-pdf.sh'

# 3. Le nettoyage, si la liste de l'essai convient.
ssh lfi '/srv/lachouetterouge/scripts/nettoyer-pdf.sh --appliquer'
```

Comme pour les images, le site reste en ligne pendant l'opération, chaque PDF
est remplacé d'un coup, et les noms de fichiers ne changent pas. Les PDF en
attente de relecture sont nettoyés aussi. Chaque PDF nettoyé est noté dans le
journal d'audit (`pdf.nettoyage`) ; le nom de l'auteur, lui, n'y est pas écrit.
Relancer le script ne change rien aux PDF déjà propres.

Ce que dit le compte rendu :

- **`AUTEUR : « … »`** au bout d'une ligne : le nom qui était inscrit dans le
  PDF, et donc public s'il était publié. Souvent c'est l'auteur du livre ou de
  l'étude, ce qui ne pose pas de problème. Mais si c'est le nom de la personne
  qui a proposé le document sous un pseudonyme, il faut le lui dire. Ce nom ne
  s'affiche que dans le terminal : il n'est noté nulle part.
- **`POSITION GPS`** : une photo du PDF indiquait l'endroit où elle a été
  prise. Même conduite que pour les images (section 7).
- **Illisibles, laissés tels quels** : un PDF chiffré, ou que le script ne
  comprend pas en entier. Il garde ses métadonnées. L'ouvrir et regarder ses
  propriétés (Fichier → Propriétés, ou Informations dans Aperçu) : si un nom
  y figure, supprimer la source dans Administration → Sources des apéros et
  demander à la personne d'en proposer une copie réenregistrée.
- **Absents du disque** : rien à nettoyer ; le lien est déjà cassé sur le site.

Ce que le script ne peut pas faire : comme pour les images, les sauvegardes et
les copies déjà téléchargées gardent la version d'origine. Un navigateur qui a
ouvert le PDF dans les dernières vingt-quatre heures peut aussi en garder
l'ancienne version en mémoire jusqu'au lendemain.

## 9. Changer de domaine (lfi-dijon.fr → lachouetterouge.fr, novembre 2026)

Le site a quitté `lfi-dijon.fr` pour `lachouetterouge.fr`. L'ancien domaine
reste branché et renvoie vers le nouveau en gardant le chemin : les liens déjà
partagés continuent de fonctionner (bloc `lfi-dijon.fr` de `docker/Caddyfile`).

**L'ordre compte.** Ce bloc suppose que `.env` désigne déjà le nouveau
domaine : si Caddy reçoit le nouveau Caddyfile alors que `SITE_DOMAIN` vaut
encore `lfi-dijon.fr`, il trouve deux blocs pour la même adresse et refuse de
démarrer - le site entier est alors injoignable. D'où la marche à suivre :

1. Chez le registrar de `lachouetterouge.fr`, deux enregistrements `A` vers
   l'adresse du serveur, pour `lachouetterouge.fr` et `www.lachouetterouge.fr`.
   Pas d'`AAAA` (voir la partie 2). Ne pas toucher aux enregistrements de
   `lfi-dijon.fr` : ils doivent continuer de viser le serveur pour que la
   redirection marche.
2. Attendre que `dig +short lachouetterouge.fr` renvoie l'adresse du serveur.
3. Sur le serveur, **avant** de récupérer le nouveau code, dans
   `/srv/lachouetterouge/.env` :

   ```bash
   ORIGIN=https://lachouetterouge.fr
   SITE_DOMAIN=lachouetterouge.fr
   ```

   (et `ADMIN_EMAIL` s'il était sur l'ancien domaine).
4. Récupérer le code et recréer les deux conteneurs, qui ne relisent `.env`
   qu'à leur création :

   ```bash
   cd /srv/lachouetterouge
   git pull --ff-only origin main
   docker compose -f docker/compose.yml up -d --build --force-recreate
   ```

5. Vérifier : `curl -I https://lachouetterouge.fr` répond 200, et
   `curl -I https://lfi-dijon.fr/articles` répond 301 vers
   `https://lachouetterouge.fr/articles`. Les premières requêtes peuvent
   échouer quelques secondes, le temps que Caddy obtienne le certificat.
6. Dans la Search Console de Google : déclarer la nouvelle propriété, y envoyer
   `/sitemap.xml`, puis utiliser « Changement d'adresse » depuis l'ancienne.

Quand `lfi-dijon.fr` ne sera plus renouvelé, retirer son bloc du Caddyfile :
sinon Caddy réclamera en vain un certificat pour lui chaque jour.

## Ce que ce dispositif protège - et ce qu'il ne protège pas

**Protégé :** injection de script (CSP stricte, HTML non interprété), injection
SQL (requêtes préparées partout), CSRF (contrôle d'origine de SvelteKit),
force brute sur les mots de passe (verrouillage + double authentification),
spam de commentaires (preuve de travail, quotas, pré-modération), lecture de
fichiers arbitraires (les images sont servies depuis la base), fuite de données
personnelles (aucune IP en clair, secrets 2FA chiffrés, images enregistrées
sans leur position GPS ni leurs autres métadonnées, PDF de la bibliothèque sans
le nom de leur auteur).

**Protégé en partie : les vagues de requêtes.** Le 16 octobre 2026, une vague
venue de 80 adresses a figé le site trois heures et demie. Depuis, le site
refuse les adresses trop insistantes, Caddy répond « surchargé » au lieu de
faire attendre, et chaque conteneur a un plafond de mémoire et des journaux
bornés : une vague de cette taille est absorbée, et si elle dépasse, le site
revient seul en quelques secondes après. Le détail est dans CLAUDE.md
(« Les vagues de requêtes »), et Administration → Fréquentation montre ce qui
arrive au site, minute par minute. Pour voir la mémoire de chaque conteneur :

```bash
ssh lfi 'docker stats --no-stream'
```

**Non protégé par le code :**

- **La saturation réseau, ou une vague venue de milliers d'adresses.** C'est
  l'anti-DDoS de l'hébergeur qui joue ce rôle pour le réseau. En cas d'attaque
  sérieuse et durable, mettre le site derrière un service de filtrage est la
  seule réponse efficace — au prix d'un tiers qui voit passer chaque visiteur.
- **Un ordinateur d'administrateur compromis.** Aucune protection côté serveur
  ne survit à un poste infecté.
- **L'hameçonnage.** La double authentification par code élève beaucoup la
  barre mais ne l'élimine pas : ne saisissez jamais vos identifiants depuis un
  lien reçu par message, tapez toujours l'adresse vous-même.

**Trois habitudes qui comptent plus que le reste :** un mot de passe unique et
long par personne, la 2FA active partout, et une sauvegarde vérifiée ailleurs
qu'sur le serveur.

## Galerie de dessins et mises à jour

La galerie collaborative utilise Sharp pour produire les vignettes. `npm ci`
installe ses binaires précompilés dans l'image Node 24 Alpine ; aucune commande
de conversion ni service d'image externe n'est nécessaire. Reconstruisez
l'image Docker lors de cette mise à jour, comme pour toute modification de
`package-lock.json`.

Les nouvelles tables SQLite sont ajoutées automatiquement à la première
requête. Le volume `data/` contient aussi les fichiers privés des propositions
(`uploads/.drawing-submissions/`), les originaux des anciens comptes rendus de
réunion (`uploads/.meeting-reports/`, fonction retirée) et le cache des vignettes
(`uploads/.thumbnails/`). Le script de sauvegarde archive tout `uploads`,
fichiers cachés compris. Ne servez jamais ce dossier directement avec Caddy :
les routes du site contrôlent l'accès aux images en attente.

Les données et illustrations d'exemple de l'aperçu local ne sont pas envoyées
par Git ni incluses dans le contexte de compilation Docker.
