## 2025-02: Events - Combine PassthroughSubject
**Statut**: Accept
**Contexte**: Les socket managers doivent publier des vnements de manire ractive
**Decision**: `PassthroughSubject<EventType, Never>` pour chaque type d'vnement, subscribers via `.sink()` + `AnyCancellable`
**Alternatives rejet**: Callbacks/closures (pas composables), AsyncStream (moins flexible pour multi-subscribers), NotificationCenter (pas type-safe)
**Cons**: Gestion manuelle des `AnyCancellable`, `[weak self]` obligatoire dans closures
