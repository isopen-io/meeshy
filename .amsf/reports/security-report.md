# Sécurité — 2026-11-27

Périmètre réel : dépendances, résolution des images, images tierces des compose. La surface applicative (authentification, autorisation, validation, secrets) n'a PAS été revue.

| Constat | Gravité | État |
|---|---|---|
| Les images résolvent `zod` 4.6.7 et d'autres paquets hors des épingles testées | élevée | ouvert, #20730 |
| `fast-uri` 3.1.2 (7 avis élevés), `node-forge` 1.4.0 (8 avis élevés), `postcss` 8.5.13 (1), `serialize-javascript` 7.0.3 dans l'arbre de test | moyenne | corrigé sur branche, #20725 |
| `autoheal:latest` avec le socket Docker, trois autres images sans version en production | moyenne | ouvert, #20731 |

`bun audit` : 50 avis, 21 élevés. Restent après #20725 : `zod` (#6235), `happy-dom` (tests), `deepmerge-ts` et `effect` (outillage Prisma).

Aucune vulnérabilité élevée ou critique introduite par la passe. Aucun secret lu ni écrit. Pas de détection de secrets dédiée dans la CI ; non vérifié plus avant.
