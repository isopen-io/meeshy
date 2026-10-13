import Foundation
import MeeshySDK

// MARK: - Les surfaces qui comptent UNE fois par montage (#10483)

/// Une surface dont chaque élément se compte AU PLUS une fois tant qu'elle
/// reste montée — le rail des stories (un anneau qui ressort de l'écran au
/// défilement n'est pas un nouvel affichage) et la citation d'une story ou
/// d'une humeur dans une bulle.
///
/// La file elle-même est un `ImpressionBatcher` PARTAGÉ par la surface
/// (`SharedImpressionBatchers`) : deux hôtes de la même surface (la grande
/// trail et la mini-trail épinglée) écriraient sinon la même clé de
/// persistance et s'écraseraient. Seul l'ensemble « déjà compté » appartient
/// au montage.
@MainActor
final class OncePerMountImpressions: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE → double-free au démontage hors
    // d'une tâche. Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    private let batcher: ImpressionBatcher
    private var counted: Set<String> = []

    init(batcher: ImpressionBatcher) {
        self.batcher = batcher
    }

    /// Les contenus `postIds` sont apparus ; seuls les nouveaux du montage entrent en file.
    func record(_ postIds: [String]) {
        postIds
            .filter { !$0.isEmpty && counted.insert($0).inserted }
            .forEach(batcher.record)
    }

    func flushNow() async {
        await batcher.flushNow()
    }
}

/// Les files partagées des surfaces montées en plusieurs endroits.
@MainActor
enum SharedImpressionBatchers {
    /// Le rail des stories : grande trail du fil et des conversations, et
    /// mini-trail épinglée de l'en-tête.
    static let storyRail = ImpressionBatcher(source: "story", surface: .storyRail)
    /// Une story ou une humeur CITÉE dans une bulle de conversation.
    static let citation = ImpressionBatcher(source: "shared_link", surface: .citation)
}

/// Ce qu'un anneau du rail affiche : les stories encore actives de son groupe.
enum StoryRailReach {
    static func displayedStoryIds(of group: StoryGroup, at now: Date = Date()) -> [String] {
        group.stories.filter { !$0.isExpired(at: now) }.map(\.id)
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
