import Foundation

/// **Un glissé horizontal engagé RÉSERVE le geste de la rangée** (#16880).
///
/// L'avatar de l'expéditeur vit DANS la bulle, sur le bord d'où part le
/// balayage d'un message reçu : son toucher partait au lever du doigt, même
/// quand ce doigt venait de faire glisser la bulle pour répondre — la fiche
/// s'ouvrait à la place de la réponse. `BubbleSwipeContainer` réserve donc le
/// geste dès que le glissé s'engage, et les touchers internes qui OUVRENT
/// quelque chose (profil, fiche, auteur cité, story) passent par `guarded` :
/// ils s'effacent tant que le glissé dure et un court instant après la levée,
/// le toucher partant précisément à ce moment-là.
///
/// Même patron que `MessagePressClaim` : un doigt à la fois, donc un état
/// global, borné dans le temps pour qu'un glissé interrompu sans fin
/// (cellule recyclée, geste annulé) ne bloque jamais les touchers suivants.
@MainActor
enum MessageSwipeClaim {
    static let releaseWindow: TimeInterval = 0.35
    static let staleEngagement: TimeInterval = 3

    private static var lastEngagement: Date?
    private static var releasedAt: Date?

    static func engage(at now: Date = Date()) {
        lastEngagement = now
        releasedAt = nil
    }

    static func release(at now: Date = Date()) {
        guard lastEngagement != nil else { return }
        lastEngagement = nil
        releasedAt = now
    }

    static func isClaimed(at now: Date = Date()) -> Bool {
        if let lastEngagement {
            return within(now.timeIntervalSince(lastEngagement), staleEngagement)
        }
        guard let releasedAt else { return false }
        return within(now.timeIntervalSince(releasedAt), releaseWindow)
    }

    static func guarded<Value>(_ action: @escaping (Value) -> Void) -> (Value) -> Void {
        { value in
            guard !isClaimed() else { return }
            action(value)
        }
    }

    private static func within(_ elapsed: TimeInterval, _ window: TimeInterval) -> Bool {
        elapsed >= 0 && elapsed < window
    }
}
