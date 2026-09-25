## 2025-01: Concurrence - async/await + @MainActor + Actor
**Statut**: Accept
**Contexte**: Swift concurrency moderne pour thread safety et performance
**Decision**: ViewModels `@MainActor class`, `actor` pour le cache (MediaCacheManager), `async/await` pour le rseau, Combine pour les streams
**Alternatives rejet**: GCD (legacy, pas de structured concurrency), tout Combine (trop verbeux pour single-value), tout async/await (Combine meilleur pour streams)
**Cons**: Paradigmes mixtes (Combine + async/await), retain cycles dans les closures Combine
