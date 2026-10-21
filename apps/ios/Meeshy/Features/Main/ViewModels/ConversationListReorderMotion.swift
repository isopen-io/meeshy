import SwiftUI
import MeeshyUI

/// La remontée en tête d'une conversation, vue depuis la LISTE (#11212).
///
/// `bumpToTop` réordonne les données ; le geste qui le rend lisible vit dans la
/// VUE, qui pose `.animation(animation(…), value: ordreDesIds)`. Deux cas le
/// suppriment : Réduire les animations (la ligne change de place sans voyager)
/// et le défilement en cours, où un ressort viendrait se battre avec le doigt.
enum ConversationListReorderMotion {
    static let response: Double = 0.35
    static let dampingFraction: Double = 0.86
    /// Délai après le dernier tick d'offset au-delà duquel la liste est au repos.
    static let scrollSettleInterval: TimeInterval = 0.3

    static func animation(reduceMotion: Bool, isScrolling: Bool) -> Animation? {
        guard !reduceMotion, !isScrolling else { return nil }
        return .spring(response: response, dampingFraction: dampingFraction)
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

/// Pose la remontée en tête sur la liste : `.animation(…, value: order)`, la
/// loi décidant du ressort. Le défilement se lit sur le RELAIS existant
/// (`onReceive`, aucun body ré-évalué par tick) — jamais un second
/// observateur de défilement.
struct ConversationListReorderAnimation<Order: Equatable>: ViewModifier {
    let order: Order
    let scrollRelay: ScrollOffsetRelay

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pulse = ConversationListScrollPulse()

    func body(content: Content) -> some View {
        content
            .onReceive(scrollRelay.objectWillChange) { _ in pulse.noteTick() }
            .animation(
                ConversationListReorderMotion.animation(reduceMotion: reduceMotion, isScrolling: pulse.isScrolling()),
                value: order
            )
    }
}
