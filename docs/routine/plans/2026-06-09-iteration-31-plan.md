# Iteration 31 — Plan d'implémentation (2026-06-09)

## Objectif
Éliminer les `(fastify as any)` casts dans les routes en complétant les déclarations de type Fastify.

## Étapes

### Phase 1 — Expansion de fastify.d.ts
- [x] Ajouter `redis`, `emailService`, `messagingService`, `mentionService`, `jobMappingCache`, `socketIOHandler`, `presenceChecker`

### Phase 2 — Migration des routes (groupe A : prisma, notificationService, socketIOHandler, emailService)
- [x] Remplacer `(fastify as any).X` → `fastify.X` pour propriétés déclarées

### Phase 3 — Migration des routes (groupe B : mentionService, messagingService, redis, jobMappingCache, presenceChecker)
- [x] Remplacer `(fastify as any).X` → `fastify.X` pour propriétés déclarées

## Propriétés conservées as any (non décorées)
- `(fastify as any).io` — non décoré, potentiel bug
- `(fastify as any).socketManager` — non décoré
- `(fastify as any).zmqClient` — non décoré
