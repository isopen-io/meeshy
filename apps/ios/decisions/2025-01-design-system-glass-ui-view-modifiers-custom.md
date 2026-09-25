## 2025-01: Design System - Glass UI + View Modifiers custom
**Statut**: Accept
**Contexte**: Design language personnalis avec `.ultraThinMaterial`, gradients, et animations spring
**Decision**: ThemeManager singleton, modifiers rutilisables (`.glassCard()`, `.pressable()`, `.shimmer()`, `.pulse()`), Color(hex:) extension
**Alternatives rejet**: UI kit tiers (pas assez de contrle), styles hardcods (pas de thming)
**Cons**: Performance des effets empils (blur+shadow+gradient), courbe d'apprentissage des modifiers
