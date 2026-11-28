# Contrats entre applications

| Contrat | Source de vérité | Consommateurs | Garde |
|---|---|---|---|
| Événements Socket.IO | `packages/shared/types/socketio-events.ts` | web, iOS, Android, passerelle | `packages/shared/__tests__/ci/swift-socket-payload-shape-gate.test.ts` et ses jumelles ; type-check bloquant |
| Réponses REST | `sendSuccess`/`sendError`, `packages/shared/types/api-schemas/` | web, iOS, Android | tests de schéma de la passerelle |
| Schémas d'entrée | Zod dans `packages/shared` et `services/gateway/src/validation/` | passerelle, web | 180 témoins web lisent les schémas de la passerelle |
| ZeroMQ passerelle ↔ traducteur | `services/gateway/src/services/zmq-translation/` | traducteur | `transientPoolRefusal.contract.test.ts` ; pas de schéma partagé entre TypeScript et Python |
| Table des langues | `packages/shared/utils/language-codes.ts` | traducteur | `translator-languages:check` |
| Base | `packages/shared/prisma/schema.prisma` | passerelle, agent | job Prisma |
| Prisme, présence, accent | `packages/shared/utils/` | web, iOS, Android | gardes de parité |
| Jetons de design | `MeeshyColors.swift` | web | `check:tokens` |
| Authentification | JWT `Authorization: Bearer`, `X-Session-Token` anonyme | tous les clients | tests de la passerelle |
| Passerelle ↔ agent | HTTP interne, jeton interne | agent | `AgentHttpClient.internal-token.test.ts` |

## État au 2026-11-27

La garde de forme des charges socket est rouge sur `dev` : `user:preferences-updated` a été réparé côté iOS et doit sortir de l'inventaire (PR #20719).

## Trou relevé

Le contrat ZeroMQ n'a pas de schéma commun aux deux langages : sa forme est écrite une fois en TypeScript et une fois en Python. Non vérifié plus avant par cette passe.
