## 2025-02: Configuration - MeeshyConfig centralis
**Statut**: Accept
**Contexte**: URLs et timeouts doivent tre configurables par environnement
**Decision**: `MeeshyConfig` avec URLs de base (API, WebSocket, media), timeouts, feature flags
**Alternatives rejet**: Hardcod (pas multi-env), xcconfig seul (pas accessible au runtime), UserDefaults (pas de dfauts types)
**Cons**: Un seul point de configuration pour tout le SDK
