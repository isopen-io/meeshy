import Foundation
import MeeshySDK
import MeeshyUI

/// Ce que l'écran de partage unique reçoit depuis le lecteur de story (#10947).
struct SharedContentWrapper: Identifiable {
    let id = UUID()
    let subject: ShareSubject
}

/// La story republiée et le `@handle` de son auteur, remis à
/// `StoryRepublishComposer` (badge d'attribution verrouillé).
struct RepostPostSourceWrapper: Identifiable {
    let id = UUID()
    let story: StoryItem
    let authorHandle: String
}

/// Enveloppe `Identifiable` d'un `SharedPlace` pour le
/// `.fullScreenCover(item:)` du reader — ouverte au tap d'une pastille de
/// lieu de la story (Layer 6.6). Même identité que `BubbleFullscreenPlace`
/// côté bulle : la paire de coordonnées.
struct StoryReaderPlaceWrapper: Identifiable {
    let place: SharedPlace
    var id: String { "\(place.latitude),\(place.longitude)" }
}
