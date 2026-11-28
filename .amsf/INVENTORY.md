# Inventaire

Mesuré sur `dev @ 467263ce24 (2026-11-27)`. Trois applications, trois services, trois bibliothèques, deux paquets tiers embarqués.

| Projet | Nature | Pile | Entrées | Livrable | Pipeline |
|---|---|---|---|---|---|
| `apps/web` (`@meeshy/web` 2.32.1) | application web, PWA, coque Android | Vite, Preact, Capacitor | `src/main.tsx`, `vite.config.ts` | image `meeshy-webapp`, APK de coque | `ci.yml`, `docker.yml`, `android-shell-release.yml` |
| `apps/ios` | application native | SwiftUI | `Meeshy/`, extensions NSE, partage, widgets | build App Store | `ios.yml`, `ios-release.yml`, `ios-fastlane-release.yml` |
| `apps/android` | application native | Kotlin, Compose | modules Gradle | build Play | `android.yml`, `android-release.yml` |
| `services/gateway` (1.98.1) | API REST et temps réel | Fastify 5, Socket.IO, ZeroMQ | `src/server.ts`, port 3000 | image `meeshy-gateway` | `ci.yml`, `docker.yml` |
| `services/agent` (1.0.78) | agent conversationnel | Fastify, LangGraph | `src/` | image `meeshy-agent` | `ci.yml`, `docker.yml` |
| `services/translator` (1.97.0) | service ML | FastAPI, PyTorch, Whisper, TTS | port 8000, ZMQ 5555 et 5558 | image `meeshy-translator` | `ci.yml` (cinq jobs), `docker.yml` |
| `packages/shared` (1.49.0) | bibliothèque partagée | TypeScript, schéma Prisma, Zod | `types/`, `utils/`, `encryption/`, `prisma/` | construite dans chaque image | `ci.yml` |
| `packages/design-tokens` | bibliothèque partagée | CSS générée depuis `MeeshyColors.swift` | `ios.css` | consommée par le web | `ci.yml` (`check:tokens`) |
| `packages/MeeshySDK` | SDK Swift | Swift Package | `Sources/MeeshySDK`, `Sources/MeeshyUI` | liée à l'app iOS | `sdk-tests.yml` |
| `packages/LibSignalClient`, `packages/libsignal-wasm` | tiers embarqués | Swift, WASM | n/a | liés à iOS et au web | `libsignal-ffi.yml` |

## Taille (fichiers source suivis)

| Projet | Sources | Fichiers de test |
|---|---|---|
| `apps/android` | 12 318 `.kt` | non compté |
| `apps/ios` | 4 791 `.swift` | non compté |
| `packages/MeeshySDK` | 4 462 `.swift` | non compté |
| `apps/web` | 3 912 `.ts`/`.tsx` | 2 741 |
| `services/gateway` | 1 840 `.ts` | 3 077 |
| `packages/shared` | 651 `.ts` | 469 |
| `services/translator` | 359 `.py` | 196 |
| `services/agent` | 62 `.ts` | 52 |

## Infrastructure

`infrastructure/docker/compose/` porte dev, local, staging et production : Traefik 3.6, MongoDB 8, Redis 8, coturn 4.6, autoheal, nginx pour les fichiers statiques. Staging et production partagent un hôte, dans deux dossiers (#9232). 24 workflows GitHub Actions.
