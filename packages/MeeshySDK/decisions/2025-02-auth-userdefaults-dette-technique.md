## 2025-02: Auth - UserDefaults (DETTE TECHNIQUE)
**Statut**: Accept (temporaire)
**Contexte**: Rapidit de dveloppement, simplicit en simulateur
**Decision**: Tokens JWT et session stocks dans `UserDefaults.standard` sous cls `meeshy_auth_token` et `meeshy_session_token`
**Alternatives rejet**: Keychain (solution correcte mais complexit entitlements)
**Cons**: **RISQUE SCURIT** - UserDefaults non chiffr, extractible depuis backup device
**Action requise**: Migrer vers Keychain avant release production (priorit haute)
