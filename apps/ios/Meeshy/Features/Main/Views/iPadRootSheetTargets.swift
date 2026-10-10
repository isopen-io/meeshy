import Foundation
import MeeshySDK

/// **La conversation qu'un toast de notification ouvre en aperçu sur iPad, sur le TAS** (#8972).
///
/// `iPadRootView` la gardait en `@State` EN LIGNE : ~1 Ko de `Conversation`. Quand le modèle a
/// gagné un champ (la pastille de série), la vue a franchi son budget de 8 192 octets
/// (`ConversationViewValueSizeGuardTests`) — or une vue SwiftUI est un type VALEUR que chaque
/// closure de son `body` copie.
///
/// Même motif que `ConversationListSheetTargets` : `@Indirect` ne se compose pas avec `@State`,
/// d'où un sac porté par UN `@State`, qui garde la liaison `Binding<Conversation?>` que
/// `.sheet(item:)` sait lire.
struct iPadRootSheetTargets {
    @Indirect var notificationPreview: Conversation? = nil
}
