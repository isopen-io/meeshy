## 2025-01: Navigation - ZStack custom (pas NavigationStack)
**Statut**: Accept
**Contexte**: Besoin d'animations personnalises (scale+fade+slide) et d'un UI immersif sans chrome
**Decision**: ZStack avec `@State` boolens, `.transition(.asymmetric())` avec spring animations, callbacks `onBack`
**Alternatives rejet**: NavigationStack (animations limites, barre de navigation impose), TabView (pas adapt au chat)
**Cons**: Pas de deep linking, bouton retour manuel, pas de swipe-to-dismiss natif, vues en mmoire
