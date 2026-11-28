# services/gateway — `@meeshy/gateway` 1.98.1

**Rôle** : API REST (`/api/v1`, ≈ 884 routes) et temps réel (Socket.IO) ; seul point d'entrée des trois clients ; chef d'orchestre du traducteur et de l'agent.

| | |
|---|---|
| Entrée | `src/server.ts`, `src/route-registration.ts` ; image `isopen/meeshy-gateway` (node:22, port 3000, sonde `/health`) |
| Dépend de | `@meeshy/shared` ; MongoDB (Prisma), Redis (ioredis, BullMQ, adaptateur Socket.IO) ; ZMQ vers traducteur (5555/5558) et agent (5560/5561) ; APNs, FCM, e-mail, SMS, S3, TURN |
| Produit | contrat REST (`route-manifest.json`), événements Socket.IO, événements ZMQ |
| Sécurité | JWT / `X-Session-Token` (`middleware/auth.ts`), rôles, limite de débit Redis, schémas Fastify et Zod, Helmet, liste d'origines CORS |
| Tests | Jest, ≈ 3 067 suites ; cliquets de contrat dans `src/__tests__/security/` |

## Vérification (2026-11-28)
| Gate | Base `dev` @ 829707d0 | Après les lots de la session |
|---|---|---|
| Typage | PASS | PASS |
| Build | PASS | voir `reports/regression-report.md` |
| Tests | 3 058 / 3 067 suites ; les 9 rouges sont d'environnement (6 codecs d'image connus, 3 tués par la mémoire et verts seuls) | idem |

## Changements de la session
- `src/services/zmq-agent/ZmqAgentClient.ts`, `src/socketio/handlers/agentMessageNotification.ts` : consomment le contrat ZMQ partagé ; `sendEvent` typé (#20759). Rien ne change sur le fil.
- `src/__tests__/unit/services/ZmqAgentClient.test.ts` : les trois témoins de transport envoient un événement du contrat.

## Risques restants
B2b (contrat ZMQ traducteur sans source unique), B7 (trois scripts aux imports morts), B8 (dépendances gRPC inutilisées). Performance : NOT VERIFIED (pas de charge reproductible ici).

**Statut de livraison** : voir `RELEASE-STATUS.md`.
