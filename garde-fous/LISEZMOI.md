# Les garde-fous

Des tests qui échouent quand un changement casse une règle du projet, même si
le site « marche ». Ils tournent avec `npm test`, et sur GitHub à chaque
demande de fusion : tant qu'ils échouent, on ne peut pas fusionner.

| Fichier | Ce qu'il garde |
| --- | --- |
| `structure.test.ts` | l'en-tête à deux portes, le menu Ressources, les trois types de publication |
| `charte.test.ts` | couleurs, marges, gabarit des pages, lisibilité du code (`CHARTE.md`) |
| `securite.test.ts` | pas de HTML brut, CSP inchangée, rien de chargé d'ailleurs, images nettoyées |
| `dependances.test.ts` | aucune dépendance nouvelle sans décision |
| `migrations.test.ts` | aucune migration déjà partie n'est modifiée |

**Un garde-fou échoue : que faire ?** Lire son message et l'en-tête du fichier,
qui disent quoi faire. Presque toujours, c'est le changement qu'il faut revoir.
On ne modifie pas un garde-fou pour le faire passer : ce dossier ne se change
qu'avec l'accord du propriétaire du dépôt (`.github/CODEOWNERS`).

Après avoir ajouté une migration : `npm run garde-fous:migrations`.
