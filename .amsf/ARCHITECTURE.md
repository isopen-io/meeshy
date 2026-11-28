# Architecture (relevée, pas prescrite — 2026-11-28)

## Exécution
```
apps/web (Vite + Preact, nginx)   apps/ios (SwiftUI)   apps/android (Kotlin/Compose)
        │ REST /api/v1 + Socket.IO        │                      │
        └──────────────┬──────────────────┴──────────────────────┘
                services/gateway  (Fastify 5, Socket.IO, :3000)
                 │        │                 │
   ZMQ PUSH 5555 │        │ ZMQ PUSH 5560   │ Prisma        ioredis / BullMQ / adaptateur Socket.IO
   ZMQ SUB  5558 │        │ ZMQ SUB  5561   ▼                       ▼
                 ▼        ▼ + HTTP interne  MongoDB 8 (replica set)   Redis 8
   services/translator   services/agent
   (FastAPI :8000,       (Fastify :3200, LangGraph,
    Whisper/NLLB/TTS)     OpenAI ; MongoDB + Redis)
```
- Passerelle → extérieur : APNs, FCM, e-mail (Brevo, SendGrid, Mailgun, Resend), SMS (Twilio, Vonage), S3, TURN.
- gRPC : dépendances déclarées dans la passerelle et le traducteur, **aucun code ne les utilise** (BACKLOG B8). Pas de GraphQL, pas de webhooks entrants hors `job_webhook` du traducteur.

## Frontières de sécurité
| Frontière | Mécanisme | Site |
|---|---|---|
| Client → passerelle | JWT `Authorization: Bearer` ; invités `X-Session-Token` | `services/gateway/src/middleware/auth.ts`, `socketio/handlers/AuthHandler.ts` |
| Rôles | `BIGBOSS > ADMIN > MODERATOR > AUDIT > ANALYST > USER` | `requireRole`, `admin-permissions.middleware.ts` |
| Débit | `@fastify/rate-limit` (300, Redis) + limites par route | `middleware/rate-limiter.ts` |
| Passerelle → agent | jeton interne (`x-meeshy-internal-token`) + trame ZMQ signée HMAC | `packages/shared/utils/agent-zmq-auth.ts` |
| Passerelle → traducteur | **aucune authentification** (HTTP ni ZMQ) : la frontière est le réseau Docker | `services/translator/CLAUDE.md` ; RISK R5 |
| E2EE | Signal (libsignal 0.106.2), optionnel et irréversible par conversation | `packages/shared/encryption`, SDK |

## Déploiement
- Quatre images (`webapp`, `gateway`, `agent`, `translator`), construites par `docker.yml` sur chaque poussée de `dev` qui touche leurs chemins, déployées aussitôt sur **staging**.
- **Production** : `promote-production.yml`, manuel, n'accepte que des digests que staging exécute, sur un commit à CI verte ; ordre `translator → agent → gateway → webapp` ; retour arrière automatique.
- Staging et production : même hôte, dossiers, bases, Redis, réseaux et secrets distincts (#9232).
- Mobile : iOS par Xcode Cloud / fastlane / andp ; Android par `android-release.yml` (Play `me.meeshy.app`).

Détail du modèle de livraison : `RELEASE-STATUS.md` et `reports/deployment-report.md`. Contrats : `contracts/`.
