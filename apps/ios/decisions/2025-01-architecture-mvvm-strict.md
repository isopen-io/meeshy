## 2025-01: Architecture - MVVM strict
**Statut**: Accept
**Contexte**: SwiftUI ncessite un pattern clair pour sparer UI et logique mtier
**Decision**: MVVM avec `@MainActor class` ViewModels, `@Published` properties, Views pures SwiftUI
**Alternatives rejet**: MVC (pas adapt SwiftUI), VIPER (trop complexe pour l'quipe), TCA (courbe d'apprentissage)
**Cons**: Boilerplate (ViewModel+View+Model par feature), Combine ncessaire pour les streams
