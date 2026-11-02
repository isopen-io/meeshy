import Foundation
import MeeshySDK
import MeeshyUI

/// Ce que l'écran de partage unique reçoit depuis le lecteur de story (#10947).
///
/// `outgoing` présent : « Partager » du menu « ⋯ » (#14311) — la feuille du
/// SYSTÈME part avec ce lien, déjà frappé. Absent : « Envoyer » du rail, la
/// feuille Meeshy.
struct SharedContentWrapper: Identifiable {
    let id = UUID()
    let subject: ShareSubject
    var outgoing: ShareableLink? = nil
}

/// **« Partager » une story hors de Meeshy** (#14311) : le lien suivi de
/// l'utilisateur (story publique) ou l'adresse directe (story non publique),
/// frappé AVANT que la feuille du système ne s'ouvre — elle ne change plus ses
/// éléments une fois présentée. Le fichier rendu de la story l'accompagne.
@MainActor
enum StoryOutsideShare {
    static func wrapper(
        story: StoryItem,
        group: StoryGroup,
        service: PostServiceProviding = PostService.shared,
        isOnline: Bool = NetworkMonitor.shared.isOnline
    ) async -> SharedContentWrapper? {
        let subject = ShareSubject.story(id: story.id, authorName: group.username, authorId: group.id, isPublic: story.isPublic)
        guard case .card(let card) = subject,
              let url = await TrackedShareLink.outgoingURL(for: card, service: service, isOnline: isOnline) else { return nil }
        let link = ShareableLink(url: url, fileSource: .story(story, author: StoryExportAuthor.served(from: group)))
        return SharedContentWrapper(subject: subject, outgoing: link)
    }
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
