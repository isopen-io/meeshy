## 2025-01: Erreurs - Hirarchie custom d'erreurs
**Statut**: Accept
**Contexte**: Rponses d'erreur structures et types pour le frontend
**Decision**: `BaseAppError` avec hirarchie (Auth/Permission/NotFound/Conflict/Validation/RateLimit/Internal), mapping Prisma (P2002/P2025), flag `isOperational`
**Alternatives rejet**: Erreurs gnriques (pas de type safety), codes HTTP bruts (pas d'info actionnable)
**Cons**: Plus de boilerplate, discipline ncessaire pour utiliser les bonnes classes
