# Graphe de dépendances (relevé du 2026-11-28)

## Dépendances de build (déclarées)
```
packages/shared ──────────┬──> services/gateway
  (aucune dép. interne)   ├──> services/agent
                          └──> apps/web <── packages/design-tokens
packages/LibSignalClient ──> packages/MeeshySDK ──> apps/ios
services/translator          (aucune dépendance de workspace)
apps/android                 (aucune dépendance de build dans le dépôt)
packages/libsignal-wasm ──(artefact committé)──> apps/web/src/lib/e2ee/libsignal/
```
Source : `npx turbo run build --dry-run=json`, `Package.swift`, `project.yml`, `settings.gradle.kts`. **Aucun cycle** entre paquets.

## Dépendances GÉNÉRÉES (invisibles du graphe de build)
`packages/shared` écrit dans d'autres projets. Un changement de la source touche le consommateur sans qu'aucun import ne le dise.

| Source | Générateur (`packages/shared`) | Sortie | Témoin de fraîcheur |
|---|---|---|---|
| `services/gateway/route-manifest.json` (≈ 884 routes) | `api-endpoints:generate` | `packages/shared/api/endpoints*` → web, gateway | `api/__tests__/endpoints-manifest-ratchet.test.ts` |
| idem | `ios-endpoints:generate` | `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/` | `api/__tests__/ios-endpoints-generated-ratchet.test.ts` |
| idem | `android-endpoints:generate` | `apps/android/core/network/…/net/routes/` | `kotlin-endpoints-generated-ratchet.test.ts` + `android.yml` (`--check`) |
| `utils/language-codes.ts` | `translator-languages:generate` | `services/translator/src/config/generated_languages.py` | `translator-languages:check` (CI `quality`) |
| politiques d'action | `action-policy-vectors:generate` | `packages/shared/fixtures/action-policy/*.vectors.json` → témoins web, Swift, Kotlin | `action-policy-vectors:check` |
| `MeeshyUI/Theme/MeeshyColors.swift` | `packages/design-tokens` `generate:ios` / `generate:android` | `ios.css`, `MeeshyPaletteGenerated.kt` | `design-tokens` `check` |

Boucle d'artefact (pas un cycle d'import) : la passerelle importe `shared/api/prefix` pour produire `route-manifest.json`, que les générateurs de `shared` relisent.

## Dépendances de LECTURE (témoins qui lisent un autre projet)
- Tests de `packages/shared` lisent `apps/ios`, `apps/android`, `apps/web`, `services/*` (gardes de parité des événements socket, de version libsignal, du contrat ZMQ agent).
- Tests Android lisent `packages/shared`, `services/gateway`, `apps/web/public/.well-known/assetlinks.json` : ils exigent le checkout complet.
- Un test de la passerelle lit la source Python du traducteur (`transientPoolRefusal.contract.test.ts`).
- Un test de l'agent IMPORTE l'évaluateur de `where` de la passerelle (`mongo-persistence-living-participation.test.ts:38`) — seul import de source entre services, délibéré (`services/agent/CLAUDE.md`).

## Consommateurs des exports de `@meeshy/shared`
| Export | web | gateway | agent |
|---|---|---|---|
| `.` / `./types` / `./types/*` | ✔ | ✔ | ✔ |
| `./utils/*` | ✔ | ✔ | ✔ |
| `./api/*` | ✔ | ✔ | — |
| `./design/*` | ✔ | — | — |
| `./encryption*` | — | ✔ | — |
| `./agent/*` | — | ✔ | ✔ |
| `./prisma*` | — | ✔ | ✔ |
| `./providers/*` | aucun importeur trouvé | | |

## Ce que « touché » veut dire
`node .amsf/scripts/inventaire.mjs --affected origin/dev` rend les workspaces modifiés, leurs consommateurs transitifs, les projets natifs modifiés et les fichiers hors projet. Il ne suit PAS les dépendances générées ni de lecture ci-dessus : un changement de `packages/shared/api`, du manifeste de routes ou d'un fichier de contrat exige en plus les jobs iOS, SDK et Android.
