# Gates par projet (commandes exactes)

Prérequis communs, depuis la racine : `bun install --ignore-scripts --no-save` ; `cd packages/shared && npx prisma generate --generator client && bun run build`.

| Projet | Typage | Build | Tests | Gardes propres | Où la CI le joue |
|---|---|---|---|---|---|
| `packages/shared` | `bun run type-check` | `bun run build` | `bun run test` (vitest) | `action-policy-vectors:check`, `translator-languages:check` | `ci.yml` `quality`, `test`, `prisma` |
| `packages/design-tokens` | — | — | `bun run test` | `bun run check` | via les chemins web et Android |
| `services/gateway` | `bun run type-check` | `bun run build` | `bun run test` (Jest, 3 lots en CI) ; `test:coverage` | cliquets `src/__tests__/security/*` | `ci.yml` `quality`, `test`, `build` |
| `services/agent` | `bun run type-check` | `bun run build` | `bun run test` (Jest) | — | `ci.yml` `quality`, `test`, `build` |
| `apps/web` | `bun run type-check` | `bun run build` | `bun run test` (bun + happy-dom) | ≈ 110 `check:*` ; `bun run gate` les enchaîne mais **la CI les joue un par un** | `ci.yml` `quality`, `web-navigateur` (Playwright, 4 lots), `test` |
| `services/translator` | — | image Docker | `uv run pytest -m "not slow and not gpu and not e2e and not integration" --cov-fail-under=37` | — | `ci.yml` quatre jobs Python 3.10 |
| `apps/ios` | — | `./apps/ios/meeshy.sh build` | `./apps/ios/meeshy.sh test` | `check_house_rules.sh`, `check_cohesion_budget.sh`, `check_test_registration.sh`, `xcodegen generate` | `ios.yml` (macOS) ; sur PR : compilation seule par défaut |
| `packages/MeeshySDK` | — | `swift build` | `-scheme MeeshySDK-Package` | — | `sdk-tests.yml` |
| `packages/LibSignalClient` | — | xcframework | tests Swift | — | `libsignal-ffi.yml` (push seulement) |
| `apps/android` | — | `assembleDebug` | `testDebugUnitTest` | `generate-android-endpoints.ts --check` | `android.yml` (seul compilateur joignable) |
| `packages/libsignal-wasm` | — | `build.sh` | — | — | **aucun workflow** (BACKLOG B9) |
| Dépôt | — | — | — | `scripts/check-*.mjs` | `ci.yml` `gardes-depot` |
| Hooks Claude | — | — | `bash .amsf/scripts/test-hooks.sh` | — | local |

Rejouer d'un coup les workspaces JavaScript : `bash .amsf/scripts/baseline.sh [chemins…]`.
Sécurité : Trivy (système de fichiers dans `ci.yml`, images dans `docker.yml`), non bloquant ; `bun audit` à la demande.
