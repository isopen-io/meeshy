# Outillage détecté et commandes de vérification

| Élément | Valeur | Source |
|---|---|---|
| Orchestrateur | Turborepo 2.11 | `turbo.json` |
| Workspaces | `apps/*`, `services/*`, `packages/*` | `pnpm-workspace.yaml`, `package.json` |
| Gestionnaire | bun 1.3.14 en CI et dans les images, pnpm 9.15.0 en voie de secours | `ci.yml`, Dockerfiles |
| Node | 22 | `package.json` `engines` |
| Versions | Changesets, base `dev` | `.changeset/config.json` |
| Base | MongoDB 8 via Prisma 6.19, Redis 8 | `packages/shared/prisma/schema.prisma` |
| Zones touchées | `scripts/ci-affected.mjs`, voie de parité `scripts/ci/voie-parite.mjs` | `ci.yml` job `changes` |

## Commandes

```bash
bun install --ignore-scripts --no-save
(cd packages/shared && npx prisma generate --generator client && bun run build)
(cd packages/shared && bun run type-check && bun run test)
(cd apps/web && bun run type-check && bun run build && bun run test)
(cd services/gateway && bun run type-check && bun run test)
(cd services/agent && bun run type-check && bun run test)
bun audit
BUN=<bun 1.3.14> node .amsf/scripts/check-image-resolution.mjs gateway agent web
```

## Limites mesurées des conteneurs de session (2026-11-27)

- `binaries.prisma.sh` est refusé par le proxy : pas de client Prisma, donc pas de type-check de la passerelle ni de l'agent, et dix suites de l'agent ne compilent pas.
- Le bun de l'image est 1.4.4 : `bun.lock` ne s'écrit que depuis bun 1.3.14 (`npm i bun@1.3.14` dans un dossier à part).
- Pas de Docker, pas de Xcode, pas de SDK Android.
- GraphQL GitHub est injoignable : les champs du projet « Meeshy — pilotage » ne se posent pas depuis une session.
