## 2025-01: Property Wrappers - Convention StateObject/ObservedObject/EnvironmentObject
**Statut**: Accept
**Contexte**: SwiftUI exige le bon wrapper pour viter les recrations de ViewModels
**Decision**: `@StateObject` quand la View CRE le VM, `@ObservedObject` pour les singletons, `@EnvironmentObject` pour VMs partags dans la hirarchie
**Alternatives rejet**: Tout en @StateObject (lifecycle incorrect pour singletons), tout en @ObservedObject (recration inattendue)
**Cons**: Subtil  comprendre, `@EnvironmentObject` manquant = crash runtime (pas compile-time)
