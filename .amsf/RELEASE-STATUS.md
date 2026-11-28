# Statut de livraison par application (relevé du 2026-11-28)

Branche `claude/monorepo-engineering-discovery-tu6gw9` @ d6f81617, qui contient `dev` @ 1d56c70f. Statuts : PASS · FAIL · BLOCKED · NOT VERIFIED · NOT APPLICABLE.

| Application | Build | Typage | Tests | Contrats | Sécurité (introduit) | Performance | Revue indép. | Statut |
|---|---|---|---|---|---|---|---|---|
| `packages/shared` | PASS | PASS | PASS | PASS | rien | NOT VERIFIED | faite | **PASS** |
| `services/gateway` | PASS | PASS | PASS (6 rouges d'environnement connus) | PASS | rien | NOT VERIFIED | faite | **PASS** pour staging |
| `services/agent` | PASS | PASS | PASS | PASS | rien | NOT VERIFIED | faite | **PASS** pour staging |
| `apps/web` | PASS | PASS | PASS à la base ; non rejoués après | PASS | rien | NOT VERIFIED | n/a (non modifié) | **PASS** (inchangé) |
| `packages/design-tokens` | n/a | n/a | PASS | PASS | rien | n/a | n/a | **PASS** (inchangé) |
| `services/translator` | CI PASS | n/a | **BLOCKED** ici ; CI PASS @ 7e0ba3f7 | partiel (B2b) | rien | NOT VERIFIED | n/a | **NOT VERIFIED** à la tête (inchangé) |
| `apps/ios` | — | — | dernier run concluant **FAIL** @ a6d6fc9d, correctif fusionné, run en file | PASS (cliquets) | rien | NOT VERIFIED | n/a | **NOT VERIFIED** |
| `packages/MeeshySDK` | CI PASS @ a6d6fc9d | — | CI PASS | PASS | rien | NOT VERIFIED | n/a | **NOT VERIFIED** à la tête (inchangé) |
| `apps/android` | CI PASS @ cbbdfe23 | — | CI PASS | PASS | rien | NOT VERIFIED | n/a | **NOT VERIFIED** à la tête (inchangé) |
| `packages/LibSignalClient`, `packages/libsignal-wasm` | — | — | — | version alignée | rien | — | n/a | **NOT VERIFIED** |
| Workflow `ios-release.yml` | — | YAML valide | — | — | corrige une fuite latente | — | faite | **NOT VERIFIED** (à prouver par un run) |
| `isopen-io/andp` | n/a | — | PASS 929 | `andp.yml` valide | rien | n/a | faite | **PASS** |

## Modèle de livraison
- Images **indépendantes par service** ; `packages/shared` n'est pas déployable, il part dans l'image de ses consommateurs.
- Couplage imposé : **passerelle et agent se promeuvent et se rétablissent ensemble** (#10290). Ordre de promotion : `translator → agent → gateway → webapp`.
- Les applications mobiles se publient à part ; le serveur porte la compatibilité avec les versions déjà installées.
- Détail et retour arrière : `reports/deployment-report.md`.

## Portes restantes (non franchies par la session)
1. Pull request vers `dev` — non ouverte, le porteur ne l'a pas demandée.
2. CI de la PR (iOS, Android, SDK, traducteur, gardes navigateur).
3. Recette sur staging, puis promotion en production par `promote-production.yml`.

Aucun artefact de livraison (image, IPA, AAB) n'a été produit par la session : ils sortent de `docker.yml` et des workflows de publication, après fusion.
