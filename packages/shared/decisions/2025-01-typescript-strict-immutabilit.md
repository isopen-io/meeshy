## 2025-01: TypeScript Strict + Immutabilit
**Statut**: Accept
**Contexte**: Package partag entre tous les services, doit tre la rfrence de type safety
**Decision**: TypeScript strict avec tous les flags avancs (`noUnusedLocals`, `noUncheckedIndexedAccess`, etc.), zro `any`, `readonly` partout (2849+ occurrences)
**Alternatives rejet**: Mode loose (bugs runtime), proprits mutables (effets de bord), `any` pour flexibilit (perte de scurit)
**Cons**: Code plus verbeux, courbe d'apprentissage
