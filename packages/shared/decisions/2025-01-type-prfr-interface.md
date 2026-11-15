## 2025-01: `type` prfr  `interface`
**Statut**: Accept
**Contexte**: Cohrence des structures de donnes dans le package
**Decision**: `type` pour les structures de donnes, `interface` rserv aux contrats de comportement (Socket.IO event maps, encryption adapters)
**Alternatives rejet**: Interface-first (moins flexible pour unions/intersections), classes (trop lourd pour data-only)
**Cons**: Sparation claire donnes vs comportement
