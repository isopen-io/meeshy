# Inventaire (découvert le 2026-11-28, `dev` @ 829707d0)

Produit par `node .amsf/scripts/inventaire.mjs`. Ne pas éditer à la main : relancer le script.

## Workspaces JavaScript (package.json racine → `workspaces`)
| paquet | chemin | version | dépend de | scripts |
|---|---|---|---|---|
| @meeshy/web | apps/web | 2.32.1 | @meeshy/design-tokens, @meeshy/shared | dev, build, type-check, test |
| @meeshy/agent | services/agent | 1.0.78 | @meeshy/shared | build, start, dev, test, type-check |
| @meeshy/gateway | services/gateway | 1.98.1 | @meeshy/shared | build, start, dev, test, type-check |
| @meeshy/translator | services/translator | 1.97.0 | — | — |
| @meeshy/design-tokens | packages/design-tokens | 0.0.0 | — | test |
| @meeshy/shared | packages/shared | 1.49.0 | — | build, type-check, test |

## Dossiers des globs de workspace SANS package.json (projets natifs)
- apps/android
- apps/ios
- packages/LibSignalClient
- packages/MeeshySDK
- packages/libsignal-wasm

## Gradle
- apps/android : 24 modules — :app :sdk-core :sdk-ui :core:common :core:model :core:network :core:database :core:datastore :core:crypto :core:e2ee :feature:auth :feature:conversations :feature:chat :feature:feed :feature:profile :feature:game :feature:notifications :feature:settings :feature:contacts :feature:community :feature:stories :feature:calls :feature:reels :feature:kit
- apps/web/android : 2 modules — :app :capacitor-cordova-android-plugins

## Swift Package Manager
| paquet | produits | paquets locaux |
|---|---|---|
| apps/ios | Meeshy | — |
| packages/LibSignalClient | LibSignalClient | — |
| packages/MeeshySDK | MeeshyCore, MeeshySDK, MeeshyUI, MeeshyE2EE | packages/LibSignalClient |

## Projets xcodegen
- apps/ios : cibles Meeshy, MeeshyWidgets, MeeshyNotificationExtension, MeeshyNotificationContentExtension, MeeshyShareExtension, MeeshyBroadcastExtension, MeeshyUIDeviceTests, MeeshyTests ; paquets locaux packages/MeeshySDK

## Rust / Python
- Cargo : meeshy-libsignal-wasm (packages/libsignal-wasm)
- Python : meeshy-translator (services/translator)
- Python : voice-cloning-test (tools/ml-conversion)

## Dockerfiles (6)
- apps/web/Dockerfile
- services/agent/Dockerfile
- services/gateway/Dockerfile
- services/translator/Dockerfile
- services/translator/Dockerfile.openvoice
- services/translator/Dockerfile.py310

## Workflows GitHub Actions (24)
- .github/workflows/android-release.yml — Android natif · publication Play
- .github/workflows/android-shell-release.yml — Android coque · publication Play
- .github/workflows/android-sqlcipher-device.yml — Android SQLCipher sur émulateur
- .github/workflows/android.yml — Android natif
- .github/workflows/beta-marker-audit.yml — Veille · marqueurs bêta et saut de CI sur main
- .github/workflows/ci.yml — CI
- .github/workflows/docker.yml — Docker
- .github/workflows/ios-appstore-readiness.yml — iOS · publiable sur l'App Store
- .github/workflows/ios-beta-trigger.yml — iOS · bêta Xcode Cloud
- .github/workflows/ios-fastlane-release.yml — iOS Release (fastlane)
- .github/workflows/ios-release.yml — iOS Release (ANDP)
- .github/workflows/ios-signing-diagnose.yml — iOS signing — diagnose
- .github/workflows/ios-wmo-probe.yml — iOS · build Release optimisé (-O)
- .github/workflows/ios-xcodegen-sync.yml — iOS · pbxproj régénéré sur [xcodegen]
- .github/workflows/ios.yml — iOS
- .github/workflows/libsignal-ffi.yml — libsignal FFI
- .github/workflows/pilotage-milestone.yml — Pilotage · milestone
- .github/workflows/pilotage-pages.yml — Pilotage — avancement (Pages)
- .github/workflows/promote-production.yml — Production · promotion et retour arrière
- .github/workflows/release.yml — Release
- .github/workflows/revision-drift-check.yml — Veille · révision servie contre sa branche
- .github/workflows/sdk-tests.yml — iOS SDK
- .github/workflows/translation-benchmark-device.yml — Banc · traduction sur l'appareil
- .github/workflows/translation-benchmark.yml — Veille · banc de traduction NLLB

## Fichiers compose (8)
- docker-compose.local-https.yml
- docker-compose.monorepo.yml
- docker-compose.yml
- infrastructure/docker/compose/docker-compose.dev.yml
- infrastructure/docker/compose/docker-compose.local.yml
- infrastructure/docker/compose/docker-compose.prod.yml
- infrastructure/docker/compose/docker-compose.staging.media-s3.yml
- infrastructure/docker/compose/docker-compose.staging.yml

## Lecture
| Catégorie | Nombre | Lesquels |
|---|---|---|
| Applications | 4 | `apps/web` (web + PWA), sa coque Android Capacitor `apps/web/android` (hors service, #13619), `apps/ios`, `apps/android` |
| Services | 3 | `services/gateway`, `services/agent`, `services/translator` |
| Bibliothèques partagées | 5 | `packages/shared`, `packages/design-tokens`, `packages/MeeshySDK`, `packages/LibSignalClient`, `packages/libsignal-wasm` |
| Outillage hors workspace | 3 | `tests/` (E2E et charge), `tools/ml-conversion`, `infrastructure/` |
| Dépôt voisin consommé | 1 | `isopen-io/andp` (publication App Store, installé par `pip` dans trois workflows iOS) |
| Images Docker livrées | 4 | `isopen/meeshy-webapp`, `-gateway`, `-agent`, `-translator` |
| Bases | 2 | MongoDB 8 (Prisma, `packages/shared/prisma/schema.prisma`), Redis 8 |
| Sources suivies | 50 682 fichiers | 13 033 TS/TSX, 12 327 Kotlin, 9 468 Swift, 593 Python |
