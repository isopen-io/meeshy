# Régression — 2026-11-27

Conditions : bun 1.3.14, `TZ=UTC` sauf mention, conteneur 2 cœurs.

## Lot #20725 — épingles de sécurité (PR #20736)

| Consommateur | Résultat | Rouges, et d'où ils viennent |
|---|---|---|
| `packages/shared` | build vert, 11 096 sur 11 097 | 1, déjà rouge sur `dev` (PR #20719) |
| `apps/web` | type-check et build verts, 35 637 sur 35 638 | 1, `act-leak-guard.test.ts`, rouge dans toute suite complète locale (#20737) |
| `services/gateway`, routes, sécurité, push | 1 045 suites sur 1 049, 15 506 tests sur 15 520 | 4 suites, 14 tests, identiques sur l'arbre de dépendances inchangé : client Prisma absent |
| `services/gateway`, 2 028 suites restantes | non rejoué | la CI des PR est gelée : preuve attendue de la CI de `dev` après fusion |
| `services/agent` | non rejoué | la CI des PR est gelée : preuve attendue de la CI de `dev` après fusion |

`bun audit` : de 50 avis (21 élevés) à 14 (5 élevés). Aucun rouge introduit dans ce qui a été rejoué.

## Lot #20729 — fuseau des témoins web (PR #20735)

| Mesure | Avant | Après |
|---|---|---|
| Témoin `timezone-isolation.test.ts`, `TZ=Europe/Brussels` | 2 rouges | 2 verts |
| Suite complète `apps/web`, `TZ=Europe/Brussels` | 26 rouges (bun 1.4.4) | 1 rouge sur 35 640 (#20737) |
| Six fichiers concernés et `src/test-support/`, arbre fusionné avec `dev` @ `7e0ba3f7` | | 260 verts |

## Rouges préexistants, hors lots

- `packages/shared` : `swift-socket-payload-shape-gate.test.ts` (PR #20719).
- `apps/web` : `act-leak-guard.test.ts` en suite complète locale (#20737).
- `services/gateway` : `bare-include-guard`, `conversation-appearance-preferences`, `status-details-history-floor`, `analytics-user-distribution-prisma-accepts`, tous par absence du client Prisma dans le conteneur.
