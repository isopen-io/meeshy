# Rapport de la plateforme partagée (2026-11-28)

Détail par paquet : `application-reports/packages-shared.md`, `application-reports/packages-natifs-et-tokens.md`.

## Gouvernance appliquée au lot #20759 (contrat ZMQ agent)
| Étape | Résultat |
|---|---|
| Consommateurs directs de `./agent/*` | `services/gateway`, `services/agent` (recherche d'imports) |
| Consommateurs transitifs | aucun client ; rien de généré |
| API publique | ajout d'un module ; aucun export modifié ni retiré |
| Compatibilité | schémas déplacés à l'identique ; forme sur le fil inchangée ; un agent et une passerelle de versions différentes restent compatibles |
| Témoin d'abord | `__tests__/agent-zmq-contract.test.ts`, poussé rouge (`3310dacf`) puis vert |
| Validation des consommateurs | `regression-report.md` |

## État des autres composants partagés
- `packages/design-tokens` : PASS.
- `packages/MeeshySDK` : PASS en CI ; `packages/LibSignalClient`, `packages/libsignal-wasm` : NOT VERIFIED (B9).

## Doublons relevés, non traités
- Contrat ZMQ traducteur (TS + Python).
- HTTP interne passerelle → agent (routes et client séparés).
Aucune abstraction partagée n'a été créée pour autre chose que supprimer une double source de contrat.
