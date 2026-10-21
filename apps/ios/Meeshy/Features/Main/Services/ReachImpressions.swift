import Foundation
import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Une apparition à l'écran = une impression (#10483)

/// Règle de comptage du porteur (2026-10-13) : un contenu se compte CHAQUE fois
/// qu'il est listé, mécaniquement ou réellement — aucun dédoublonnage, ni dans
/// le temps ni par montage — hors deux vues qui montrent le MÊME contenu au même
/// endroit (`ReachPresence`, #11037). Ce qui ne compte pas, c'est un re-rendu : SwiftUI
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
    /// #11037 — partagée par les vues qui montrent le MÊME contenu au même
    /// endroit logique (les deux rangées du rail) ; `nil` : chaque apparition compte.
    let presence: ReachPresence?
    let record: @MainActor (String) -> Void

    @State private var held: String?

    func body(content: Content) -> some View {
        content
            .onAppear { show(postId) }
            .onDisappear { hide() }
            .adaptiveOnChange(of: postId) { _, newValue in
                guard recountsOnChange else { return }
                hide()
                show(newValue)
            }
    }

    private func show(_ id: String?) {
        guard let id, !id.isEmpty else { return }
        guard let presence else { return record(id) }
        held = id
        if presence.appeared(id) { record(id) }
    }

    private func hide() {
        guard let presence, let id = held else { return }
        held = nil
        presence.disappeared(id)
    }
}

/// Un AFFICHAGE, pas une apparition de vue (#11037). La grande rangée du rail
/// et sa rangée épinglée montrent les mêmes anneaux : pendant le fondu du
/// défilement les deux sont montées, et la rangée épinglée se monte et se
/// démonte à chaque passage du seuil. Mesuré en production (2026-10-19) :
/// 12 % des impressions répétées du rail arrivaient moins de 2 s après la
/// précédente, pour le même lecteur et la même story.
///
/// Un contenu ne compte qu'en entrant à l'écran alors qu'aucune vue ne le
/// montre déjà, et pas s'il revient moins de `rejoinGrace` après en être sorti.
/// Un vrai retour reste un nouvel affichage : la règle du porteur (2026-10-13)
/// compte chaque affichage des autres lecteurs.
@MainActor
final class ReachPresence {
    nonisolated deinit {}

    static let rejoinGrace: TimeInterval = 2

    private let clock: @MainActor () -> Date
    private var holders: [String: Int] = [:]
    private var leftAt: [String: Date] = [:]

    init(clock: @escaping @MainActor () -> Date = { Date() }) {
        self.clock = clock
    }

    /// Une vue commence à montrer `id` ; vrai si c'est un nouvel affichage.
    func appeared(_ id: String) -> Bool {
        let held = holders[id, default: 0]
        holders[id] = held + 1
        guard held == 0 else { return false }
        let now = clock()
        leftAt = leftAt.filter { now.timeIntervalSince($0.value) < Self.rejoinGrace }
        return leftAt[id] == nil
    }

    /// Une vue cesse de montrer `id`.
    func disappeared(_ id: String) {
        guard let held = holders[id] else { return }
        guard held == 1 else {
            holders[id] = held - 1
            return
        }
        holders[id] = nil
        leftAt[id] = clock()
    }
}

extension View {
    /// Compte une impression de `postId` à chaque apparition (`nil` : rien) ;
    /// avec une `presence`, seule l'entrée du contenu à l'écran compte.
    func countsImpression(
        of postId: String?,
        recountsOnChange: Bool = true, presence: ReachPresence? = nil,
        _ record: @escaping @MainActor (String) -> Void
    ) -> some View {
        modifier(ReachImpressionModifier(postId: postId, recountsOnChange: recountsOnChange, presence: presence, record: record))
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
    /// #11037 — ce que le rail montre, ses deux rangées confondues.
    static let railPresence = ReachPresence()

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
