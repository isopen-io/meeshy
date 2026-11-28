# Plateforme partagée — 2026-11-27

`packages/shared` : voir `application-reports/shared.md`.

## Dépendances communes

Le lot #20725 a monté quatre épingles `overrides`. Consommateurs identifiés avant le changement :

| Paquet | Consommateurs directs | Chemin |
|---|---|---|
| `fast-uri` | passerelle, agent, web (construction) | `ajv`, `fast-json-stringify`, `@fastify/swagger`, `workbox-build` |
| `node-forge` | passerelle | `@parse/node-apn` |
| `postcss` | web (construction) | `vite` |
| `serialize-javascript` | web (construction) | `workbox-build` |

Validation : voir `regression-report.md`.

## Constat de fond

Les épingles racine ne gouvernent que l'arbre installé depuis `bun.lock`. Les images et la voie pnpm résolvent autrement (#20730).
