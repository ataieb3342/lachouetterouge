#!/bin/sh
# Retire les métadonnées (position GPS, date, appareil…) des images déjà en
# ligne, sur le serveur. À lancer une fois, après la mise à jour du 23 octobre
# 2026 - les images envoyées depuis sont nettoyées à l'envoi.
#
#     ./scripts/nettoyer-images.sh              # essai : dit ce qu'il ferait
#     ./scripts/nettoyer-images.sh --appliquer  # nettoie
#
# Le travail est fait par scripts/nettoyer-images.js. Il tourne dans un
# conteneur jetable tiré de l'image du site : même version de Node, même
# utilisateur, mêmes données. Cette image ne contient que le site compilé ; le
# code source lui est prêté, en lecture seule, le temps de l'opération.

set -eu

RACINE="$(cd "$(dirname "$0")/.." && pwd)"

docker compose -f "$RACINE/docker/compose.yml" run --rm --no-deps -T \
	-v "$RACINE/src:/app/src:ro" \
	-v "$RACINE/scripts:/app/scripts:ro" \
	site node --experimental-strip-types scripts/nettoyer-images.js "$@"
