# `services/agent` — 2026-11-27

Statut de release : **BLOCKED (#20730)**. Base : `dev` @ `467263ce24`, passe du 2026-11-27.

| Porte | Résultat | Preuve |
|---|---|---|
| Build, type-check | NOT VERIFIED | client Prisma absent dans le conteneur |
| Tests | NOT VERIFIED | 10 suites ne compilent pas sans le client Prisma |
| Image | BLOCKED | installée par `pnpm install --no-frozen-lockfile`, sans épingles ; `zod` 4.6.7 (#20730) |

Périmètre : agent conversationnel, appelé par la passerelle en HTTP interne, lit et écrit MongoDB. Dépend de `@meeshy/shared`.

Non regardé : tout le reste.
