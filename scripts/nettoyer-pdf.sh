#!/bin/sh
# Retire le nom de l'auteur et les autres métadonnées des PDF déjà déposés
# dans la bibliothèque, sur le serveur. À lancer une fois, après la mise à jour
# du 24 octobre 2026 - les PDF proposés depuis sont nettoyés à l'envoi.
#
#     ./scripts/nettoyer-pdf.sh              # essai : dit ce qu'il ferait
#     ./scripts/nettoyer-pdf.sh --appliquer  # nettoie
#
# Le travail est fait par scripts/nettoyer-pdf.js. Il tourne dans un
# conteneur jetable tiré de l'image du site : même version de Node, même
# utilisateur, mêmes données. Cette image ne contient que le site compilé ; le
# code source lui est prêté, en lecture seule, le temps de l'opération.

set -eu

RACINE="$(cd "$(dirname "$0")/.." && pwd)"

docker compose -f "$RACINE/docker/compose.yml" run --rm --no-deps -T \
	-v "$RACINE/src:/app/src:ro" \
	-v "$RACINE/scripts:/app/scripts:ro" \
	site node --experimental-strip-types scripts/nettoyer-pdf.js "$@"
