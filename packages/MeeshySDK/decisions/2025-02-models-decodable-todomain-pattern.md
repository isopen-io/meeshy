## 2025-02: Models - Decodable + toDomain() pattern
**Statut**: Accept
**Contexte**: Les rponses API et les modles de domaine ont des formes diffrentes
**Decision**: Modles `APIxxx: Decodable` (forme API) avec extensions `toDomain()` vers modles de domaine (forme app)
**Alternatives rejet**: Modle unique (mlange concerns API et UI), DTO manual mapping (plus verbeux), Codable bidirectionnel (pas toujours ncessaire)
**Cons**: Double modle  maintenir, mais sparation claire API vs domaine
