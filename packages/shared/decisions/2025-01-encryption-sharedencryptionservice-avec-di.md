## 2025-01: Encryption - SharedEncryptionService avec DI
**Statut**: Accept
**Contexte**: Mme code de chiffrement sur frontend (Web Crypto) et backend (Node crypto)
**Decision**: SharedEncryptionService avec injection de dpendances (CryptoAdapter, KeyStorageAdapter), Signal Protocol optionnel
**Alternatives rejet**: Impls spares par plateforme (duplication), Web Crypto only (pas Node.js), Node crypto only (pas browser)
**Cons**: Setup DI plus complexe, mais testable avec mocks
