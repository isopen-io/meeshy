# apps/ios — Meeshy iOS 1.1.9 (build 1825)

**Rôle** : application SwiftUI `me.meeshy.app` et cinq extensions (widgets, service et contenu de notification, partage, diffusion). Référence d'interface des deux autres clients.

| | |
|---|---|
| Entrée | `project.yml` (xcodegen) ; cibles Meeshy, MeeshyWidgets, MeeshyNotificationExtension, MeeshyNotificationContentExtension, MeeshyShareExtension, MeeshyBroadcastExtension |
| Dépend de | `packages/MeeshySDK` (chemin local) → `packages/LibSignalClient` ; Firebase |
| Sécurité | jetons et secrets E2EE au Keychain, épinglage SPKI |
| Livraison | Xcode Cloud, fastlane (`beta`, `release`), andp (`andp.yml`) ; porte d'approbation `appstore-submit` |

## Vérification (2026-11-28)
- Ici : **NOT APPLICABLE** (pas de macOS).
- CI `ios.yml` : dernier run concluant **FAIL** (46079384929 @ a6d6fc9d) ; correctif fusionné (c54ce2f7, #20742) ; son run et celui de la tête étaient en file au relevé. Statut : **NOT VERIFIED** à la tête de `dev`.
- `apps/ios/andp.yml` : valide contre les chargeurs d'andp (9 cibles, 0 erreur de section `store`).

## Changements de la session
- `.github/workflows/ios-release.yml` : l'artefact `andp-state` n'emporte plus la clé privée App Store Connect (#20758).

## Risques restants
B3 (andp installé par `@v1` flottant sur le chemin de publication), B16 (tests iOS non joués sur PR par défaut).
