## 2025-01: Database - Prisma 6.19 + MongoDB 8
**Statut**: Accept
**Contexte**: Schma flexible pour messaging, types auto-gnrs, support transactions
**Decision**: Prisma ORM avec MongoDB (replica set), schma unique dans `packages/shared/prisma/schema.prisma`
**Alternatives rejet**: Mongoose (types manuels, populate() stringly-typed), PostgreSQL (schma rigide pour documents)
**Cons**: Support MongoDB Prisma moins mature que PostgreSQL, pas de full-text search natif
