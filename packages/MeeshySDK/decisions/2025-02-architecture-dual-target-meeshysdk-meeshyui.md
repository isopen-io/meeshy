## 2025-02: Architecture - Dual-Target (MeeshySDK + MeeshyUI)
**Statut**: Accept
**Contexte**: Sparation logique mtier et UI pour rutilisabilit
**Decision**: Deux targets SPM: `MeeshySDK` (core, pas de SwiftUI) et `MeeshyUI` (composants SwiftUI, dpend de MeeshySDK)
**Alternatives rejet**: Target unique (force dpendance SwiftUI pour le core), framework spar (overhead maintenance), micro-packages (trop fragment)
**Cons**: Possibilit d'utiliser le SDK sans UI (tests, extensions, widgets)
