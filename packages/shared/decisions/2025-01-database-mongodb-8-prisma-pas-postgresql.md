## 2025-01: Database - MongoDB 8 + Prisma (PAS PostgreSQL)
**Statut**: Accept
**Contexte**: Schma flexible pour messaging, documents imbriqus, scalabilit horizontale
**Decision**: MongoDB 8 avec replica set (transactions), Prisma ORM, dnormalisation pour performance (memberCount, reactionSummary), soft deletes
**Alternatives rejet**: PostgreSQL (mentionn dans anciens docs mais OBSOLTE), MySQL (pas adapt), raw driver (perte type safety)
**Cons**: Replica set obligatoire, pas de full-text search natif (besoin Atlas Search)
