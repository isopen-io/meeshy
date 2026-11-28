# Contrats entre applications (relevé du 2026-11-28)

Pour chaque contrat : où est sa source, qui le produit, qui le consomme, et quel témoin tient les deux côtés ensemble.

| Contrat | Source unique ? | Producteur → consommateurs | Témoins |
|---|---|---|---|
| **REST** `/api/v1` | Oui : routes de la passerelle → `route-manifest.json` → catalogues générés | gateway → web (TS), iOS (Swift généré), Android (Kotlin généré) | `route-manifest-ratchet`, les trois cliquets de génération, `check-web-api-literals.mjs`, test de fumée des routes après déploiement |
| **Format de réponse** | Oui : `sendSuccess`/`sendError` + `api-schemas/error.ts` | gateway → tous | `response-schema-stub-ratchet`, `unauthorized-code-ratchet` |
| **Socket.IO** | Oui pour TS (`packages/shared/types/socketio-events/`) ; Swift et Kotlin écrivent les noms à la main | gateway ↔ web, iOS, Android | sept cliquets de `packages/shared/__tests__/ci/socket-event-*` ; `SocketEventNamesParityTest.kt` |
| **ZMQ passerelle ↔ traducteur** | **Non** : interfaces TS (`zmq-translation/types.ts`) et dictionnaires Python (`zmq_models.py`, `zmq_translation_handler.py`) | gateway ↔ translator | un seul témoin ciblé (`transientPoolRefusal.contract.test.ts`) — BACKLOG B2 |
| **ZMQ passerelle ↔ agent** | **Oui depuis #20759** : `packages/shared/agent/zmq-contract.ts` | gateway ↔ agent | `packages/shared/__tests__/agent-zmq-contract.test.ts` ; signature : `agent-zmq-auth.test.ts` |
| **HTTP interne passerelle → agent** | Non (routes `/api/agent/*` et client écrits séparément) | gateway → agent | tests unitaires de chaque côté |
| **Schéma MongoDB** | Oui : `packages/shared/prisma/schema.prisma` | gateway, agent | job `prisma` (validate + generate) ; pas de migration automatisée |
| **Langues** | Oui : `utils/language-codes.ts` → Python généré | shared → translator | `translator-languages:check`, `test_supported_languages_single_source.py` |
| **Résolution de langue (Prisme)** | TS partagé ; miroirs Swift et Kotlin tenus à la main | shared → web ; SDK ; Android | témoins par plateforme (CLAUDE.md § Prisme) |
| **Présence** | TS partagé ; miroirs Swift et Kotlin | idem | idem + `presence-visibility-viewer-aware-guard.test.ts` |
| **Politiques d'action** | Oui : vecteurs JSON générés | shared → web, Swift, Kotlin | `action-policy-vectors:check` + un témoin par plateforme |
| **Jetons de design** | Source Swift (`MeeshyColors.swift`) → CSS et Kotlin générés | iOS → web, Android | `design-tokens` `check`, `MeeshyIosCssParityTest.kt` |
| **libsignal** | Une version (0.106.2) | toutes plateformes | `libsignal-version-alignment.test.ts` |
| **andp** (dépôt voisin) | `apps/ios/andp.yml` contre les chargeurs d'andp | meeshy → andp | validé hors ligne le 2026-11-28 : 9 cibles résolues, 0 erreur de section `store` ; réf. `@v1` flottante dans deux workflows — BACKLOG B3 |

## Compatibilité
La production a des utilisateurs : un contrat évolue de façon rétrocompatible, et un ancien chemin ne se retire qu'à zéro usage mesuré (CLAUDE.md, #9223, #9231). Les applications mobiles publiées ne se mettent pas à jour avec le serveur : c'est le serveur qui porte la compatibilité.
