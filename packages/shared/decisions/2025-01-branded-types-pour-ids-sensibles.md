## 2025-01: Branded Types pour IDs sensibles
**Statut**: Accept
**Contexte**: Prvenir la confusion compile-time entre types d'identifiants
**Decision**: Types brands via intersection: `type AnonymousParticipantId = string & { readonly __brand: 'AnonymousParticipantId' }`
**Alternatives rejet**: Strings simples (pas de protection compile-time), classes (overhead runtime), opaque types (pas support nativement par TS)
**Cons**: Zro overhead runtime, meilleure documentation d'intention
