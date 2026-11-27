# Statut de release par application

Passe du 2026-11-27 sur `dev @ 467263ce24 (2026-11-27)`. Statuts : PASS, FAIL, BLOCKED, NOT VERIFIED, NOT APPLICABLE. Un statut ne devient PASS que sur preuve.

| Application | Build | Type-check | Lint | Tests | Contrats | Sécurité | Performance | Revue indépendante | Statut |
|---|---|---|---|---|---|---|---|---|---|
| `packages/shared` | PASS | PASS | NOT APPLICABLE | FAIL (1 sur 11 097) | FAIL | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | **FAIL** |
| `packages/design-tokens` | NOT APPLICABLE | NOT APPLICABLE | NOT APPLICABLE | PASS | NOT VERIFIED | NOT VERIFIED | NOT APPLICABLE | NOT VERIFIED | **NOT VERIFIED** |
| `apps/web` | PASS | PASS | NOT APPLICABLE | PASS (35 638, bun 1.3.14, UTC) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | **BLOCKED** (#20730) |
| `services/gateway` | NOT VERIFIED | NOT VERIFIED | NOT APPLICABLE | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | **BLOCKED** (#20730) |
| `services/agent` | NOT VERIFIED | NOT VERIFIED | NOT APPLICABLE | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | **BLOCKED** (#20730) |
| `services/translator` | NOT VERIFIED | NOT APPLICABLE | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | **NOT VERIFIED** |
| `apps/ios` | NOT VERIFIED | NOT APPLICABLE | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | **NOT VERIFIED** |
| `packages/MeeshySDK` | NOT VERIFIED | NOT APPLICABLE | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | **NOT VERIFIED** |
| `apps/android` | NOT VERIFIED | NOT APPLICABLE | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | **NOT VERIFIED** |

Lint NOT APPLICABLE : aucun paquet TypeScript ne déclare de script `lint` (#20732).

## Monorepo

**FAIL.** `dev` est rouge sur `packages/shared` (PR #20719 en cours), et les images de trois applications ne contiennent pas les versions testées (#20730).

## Déploiement

Aucun déploiement n'a été fait par cette passe. L'ordre de déploiement d'un lot qui touche un contrat : base et Redis, traducteur, passerelle, agent, web, puis les clients natifs, la passerelle restant rétrocompatible avec les anciens clients (#9223). Retour arrière : `promote-production.yml`.
