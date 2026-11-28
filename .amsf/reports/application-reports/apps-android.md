# apps/android — Meeshy Android natif 3.1.0

**Rôle** : application Kotlin/Compose `me.meeshy.app`, qui vise l'iso de l'application iOS (#11570).

| | |
|---|---|
| Entrée | 24 modules Gradle : `:app`, `:sdk-core`, `:sdk-ui`, 7 `:core:*`, 14 `:feature:*` |
| Dépend de | rien à construire dans le dépôt ; routes Kotlin générées par `packages/shared` ; ses tests lisent `packages/shared`, `services/gateway`, `apps/web/public/.well-known` |
| Sécurité | jetons chiffrés (Keystore), base SQLCipher, épinglage SPKI, clair interdit en release |
| Livraison | `android-release.yml` vers Google Play ; `versionCode` = nombre de commits |

## Vérification (2026-11-28)
- Ici : **NOT APPLICABLE** (`dl.google.com` refusé ; la CI est le seul compilateur joignable).
- CI `android.yml` : **PASS** (46091861831 @ cbbdfe23). Le run de la tête de `dev` était annulé/en file au relevé.

Aucun changement dans cette session.

## Risques restants
Les miroirs tenus à la main (Prisme, présence, noms d'événements socket) dépendent de témoins de parité ; voir `contracts/README.md`.
