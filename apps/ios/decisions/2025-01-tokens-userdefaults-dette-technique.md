## 2025-01: Tokens - UserDefaults (DETTE TECHNIQUE)
**Statut**: Accept (temporaire)
**Contexte**: Simplicit de dveloppement, pas de problmes Keychain en simulateur
**Decision**: JWT et session tokens stocks dans `UserDefaults.standard`
**Alternatives rejet**: Keychain (complexit et entitlements) - DEVRAIT TRE LA SOLUTION FINALE
**Cons**: **RISQUE SCURIT** - UserDefaults non chiffr, tokens extractibles depuis backup
**Action requise**: Migrer vers Keychain avant release production
