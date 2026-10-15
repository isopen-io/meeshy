import Foundation
import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Une apparition à l'écran = une impression (#10483)

/// Règle de comptage du porteur (2026-10-13) : un contenu se compte CHAQUE fois
/// qu'il est listé, mécaniquement ou réellement — aucun dédoublonnage, ni dans
/// le temps ni par montage. Ce qui ne compte pas, c'est un re-rendu : SwiftUI
/// réévalue un `body` sans que rien n'apparaisse, et seul `onAppear` dit
/// qu'une vue est entrée à l'écran.
///
/// `recountsOnChange` : la vue reste à l'écran mais montre un AUTRE contenu
/// (l'humeur d'un avatar remplacée par une nouvelle) — c'est un nouvel
/// affichage. Le rail ne le demande pas : l'anneau change de story quand on
/// la regarde, derrière le lecteur qui la couvre.
struct ReachImpressionModifier: ViewModifier {
    let postId: String?
    let recountsOnChange: Bool
    let record: @MainActor (String) -> Void

    func body(content: Content) -> some View {
        content
            .onAppear { count(postId) }
            .adaptiveOnChange(of: postId) { _, newValue in
                guard recountsOnChange else { return }
                count(newValue)
            }
    }

    private func count(_ id: String?) {
        guard let id, !id.isEmpty else { return }
        record(id)
    }
}

extension View {
    /// Compte une impression de `postId` à chaque apparition de la vue.
    /// `nil` (aucun contenu à compter) ne compte rien.
    func countsImpression(
        of postId: String?,
        recountsOnChange: Bool = true,
        _ record: @escaping @MainActor (String) -> Void
    ) -> some View {
        modifier(ReachImpressionModifier(postId: postId, recountsOnChange: recountsOnChange, record: record))
    }
}

extension ImpressionBatcher: ReachImpressionRecording {}

/// Les files partagées des surfaces montées en plusieurs endroits.
@MainActor
enum SharedImpressionBatchers {
    /// Le rail des stories : grande trail du fil et des conversations, et
    /// mini-trail épinglée de l'en-tête.
    static let storyRail = ImpressionBatcher(source: "story", surface: .storyRail)
    /// Une story ou une humeur CITÉE dans une bulle de conversation.
    static let citation = ImpressionBatcher(source: "shared_link", surface: .citation)
    /// L'humeur peinte sur un avatar (liste de conversations, membres,
    /// contacts, partage) — une file pour tous ses hôtes.
    static let moodAvatar = ImpressionBatcher(source: "status", surface: .moodAvatar)
    /// L'humeur peinte sur un anneau du rail des stories.
    static let moodRail = ImpressionBatcher(source: "status", surface: .storyRail)

    /// Le rail quitte l'écran : ses deux files partent.
    static func flushRail() async {
        await storyRail.flushNow()
        await moodRail.flushNow()
    }
}

/// Ce qu'un anneau du rail MONTRE : UNE story, celle que son toucher ouvre —
/// la première encore active que le lecteur n'a pas vue, ou la première
/// active quand il les a toutes vues. Les autres stories du groupe ne sont
/// pas listées : elles n'apparaissent qu'une fois le lecteur ouvert, qui les
/// compte lui-même.
enum StoryRailReach {
    static func displayedStoryId(of group: StoryGroup, at now: Date = Date()) -> String? {
        let active = group.stories.filter { !$0.isExpired(at: now) }
        return (active.first { !$0.isViewed } ?? active.first)?.id
    }
}

/// Le contenu qu'une citation de bulle AFFICHE : une story ou une humeur,
/// et seulement si elle est encore lisible. Une réponse à un message n'est pas
/// un affichage de publication.
enum CitationReach {
    static func citedContentId(of reference: ReplyReference) -> String? {
        guard reference.isStoryReply || reference.moodEmoji != nil else { return nil }
        guard !reference.isUnavailableStory, !reference.messageId.isEmpty else { return nil }
        return reference.messageId
    }
}
