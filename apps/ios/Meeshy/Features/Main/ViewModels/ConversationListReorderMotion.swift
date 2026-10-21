import SwiftUI
import MeeshyUI

/// La remontée en tête d'une conversation, vue depuis la LISTE (#11212).
///
/// `bumpToTop` réordonne les données ; le geste qui le rend lisible vit dans la
/// VUE, qui pose `.animation(animation(…), value: ordreDesIds)`. Deux cas le
/// suppriment : Réduire les animations (la ligne change de place sans voyager)
/// et le défilement en cours, où un ressort viendrait se battre avec le doigt.
///
/// Et SEULE la remontée s'anime : un changement de filtre, une page ajoutée,
/// un changement de compte ou une réconciliation qui réécrit la liste se
/// remplacent sans ressort — `isBumpToTop` reconnaît la remontée à sa forme.
enum ConversationListReorderMotion {
    static let response: Double = 0.35
    static let dampingFraction: Double = 0.86
    /// Délai après le dernier tick d'offset au-delà duquel la liste est au repos.
    static let scrollSettleInterval: TimeInterval = 0.3

    static func animation(reduceMotion: Bool, isScrolling: Bool) -> Animation? {
        guard !reduceMotion, !isScrolling else { return nil }
        return .spring(response: response, dampingFraction: dampingFraction)
    }

    /// Une remontée en tête : les MÊMES conversations, l'une passée en tête,
    /// les autres dans leur ordre d'avant. Tout autre changement d'ordre
    /// (filtre, page, compte, liste réécrite) n'en est pas une.
    static func isBumpToTop(from previous: [String], to current: [String]) -> Bool {
        guard let head = current.first,
              previous.count == current.count,
              previous.first != head,
              previous.contains(head) else { return false }
        return Array(current.dropFirst()) == previous.filter { $0 != head }
    }

    static func isScrolling(lastTick: Date?, now: Date) -> Bool {
        guard let lastTick else { return false }
        return now.timeIntervalSince(lastTick) < scrollSettleInterval
    }
}

/// Le dernier tick de défilement, retenu dans une boîte INERTE : l'écrire à
/// chaque image ne ré-évalue aucun body (même famille que `ScrollOffsetRelay`
/// et `ConversationSearchBarScrollAnchor`). La liste ne le LIT qu'au moment où
/// elle se ré-évalue pour une autre raison — un réordonnancement.
final class ConversationListScrollPulse {
    nonisolated deinit {}

    private(set) var lastTick: Date?

    func noteTick(at date: Date = Date()) {
        lastTick = date
    }

    func isScrolling(now: Date = Date()) -> Bool {
        ConversationListReorderMotion.isScrolling(lastTick: lastTick, now: now)
    }
}

/// L'ordre que la liste montrait avant la passe en cours, retenu dans une
/// boîte INERTE : il n'avance qu'après la passe (`onChange`), donc toute
/// ré-évaluation de cette passe compare au même « avant ».
final class ConversationListOrderMemory {
    nonisolated deinit {}

    var order: [String]?
}

/// Pose la remontée en tête sur la liste : `.animation(…, value: order)`, la
/// loi décidant du ressort. Le défilement se lit sur le RELAIS existant
/// (`onReceive`, aucun body ré-évalué par tick) — jamais un second
/// observateur de défilement. Réduire les animations se lit sur ses DEUX
/// moitiés (`Components/ReduceMotion.swift`).
struct ConversationListReorderAnimation: ViewModifier {
    let order: [String]
    let scrollRelay: ScrollOffsetRelay

    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion
    @State private var pulse = ConversationListScrollPulse()
    @State private var memory = ConversationListOrderMemory()

    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }

    private var motion: Animation? {
        guard ConversationListReorderMotion.isBumpToTop(from: memory.order ?? order, to: order) else { return nil }
        return ConversationListReorderMotion.animation(reduceMotion: reduceMotion, isScrolling: pulse.isScrolling())
    }

    func body(content: Content) -> some View {
        content
            .onReceive(scrollRelay.objectWillChange) { _ in pulse.noteTick() }
            .animation(motion, value: order)
            .onAppear { memory.order = order }
            .onChange(of: order) { memory.order = $0 }
    }
}
