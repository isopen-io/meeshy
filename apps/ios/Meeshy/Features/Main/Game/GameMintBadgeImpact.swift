import Foundation
import MeeshySDK

/// CE QU'UNE FRAPPE ÉTEINT (#9383, #9379) — le chiffre de l'aperçu (« 2 badges
/// redescendent ») et celui du guide (« 11 actions pour le rallumer »), annoncés
/// AVANT le geste. Miroir de `apps/web/src/lib/view/game-mint.ts` et du plan de
/// débit `computeMeeshMintPlan` (`packages/shared/utils/meesh.ts`).
///
/// Le débit est la loi : on reprend d'abord le plus renouvelable (messages), on
/// protège en dernier ce qui a demandé un outil ou un don, les conversations en
/// tout dernier — et jamais leurs ACTIONS (on reprend leurs points, pas leur
/// compteur : récompenser l'ouverture de fils bidon serait pervers). Ici on ne
/// fait que COMPTER, axe par axe, les paliers de badge que `count - repris` ne
/// tient plus, et la distance au PLUS PROCHE d'entre eux — c'est elle que le guide
/// promet.
///
/// Un serveur qui ne sert pas les points par axe (`points` absent) ne permet pas
/// ce calcul : on rend `nil` (« inconnu »), jamais un `0` qui dirait « aucun badge
/// ne s'éteint » à tort.
nonisolated struct MintBadgeImpact: Equatable, Sendable {
    /// Paliers de badge qui tombent, tous axes confondus.
    let lost: Int
    /// Actions à refaire pour rallumer le plus proche ; `0` quand rien ne tombe.
    let regain: Int
}

nonisolated enum GameMintBadgeImpact {

    /// L'ordre du débit, par rangs (décision porteur) — le plus renouvelable d'abord.
    static let debitOrder: [[String]] = [
        ["content.text_message", "content.audio_message"],
        ["comment.text", "comment.audio"],
        ["content.story"],
        ["content.post", "content.reel"],
        ["tool.sticker", "tool.in_app_edit", "tool.direct_publish", "tool.reaction", "tool.attachment"],
        ["social.tracked_link", "social.share", "social.invite_joined", "social.friendship"],
        ["conversation.private", "conversation.public", "conversation.community", "conversation.group_created"],
    ]

    /// Les axes dont la frappe reprend les POINTS mais jamais les ACTIONS.
    static let pointsOnlyAxes: Set<String> = [
        "conversation.private", "conversation.public", "conversation.community", "conversation.group_created",
    ]

    private struct Axis {
        let count: Int
        let points: Int
    }

    private static func finite(_ value: Int) -> Int { max(0, value) }

    /// `Math.round` de JavaScript (la moitié vers le haut) sur un rapport positif.
    private static func rounded(_ numerator: Int, _ denominator: Int) -> Int {
        (2 * numerator + denominator) / (2 * denominator)
    }

    static func impact(counters: [APIEngagementProgress.Counter], price: Int) -> MintBadgeImpact? {
        guard counters.allSatisfy({ $0.points != nil }) else { return nil }
        let known = Set(EngagementAxisKey.allCases.map(\.rawValue))
        var axes: [String: Axis] = [:]
        for counter in counters where known.contains(counter.axisKey) {
            axes[counter.axisKey] = Axis(count: finite(counter.count), points: finite(counter.points ?? 0))
        }
        let debitable = axes.values.reduce(0) { $0 + $1.points }
        guard price > 0, debitable >= price else { return MintBadgeImpact(lost: 0, regain: 0) }

        var remaining = price
        var losses: [(dropped: Int, regain: Int)] = []
        outer: for rank in debitOrder {
            for key in rank {
                if remaining == 0 { break outer }
                guard let axis = axes[key], axis.points > 0 else { continue }
                let points = min(remaining, axis.points)
                let count = pointsOnlyAxes.contains(key) || axis.count == 0
                    ? 0
                    : min(axis.count, rounded(points * axis.count, axis.points))
                remaining -= points
                let after = max(0, axis.count - count)
                let dropped = EngagementCatalog.badgeThresholds.filter { axis.count >= $0 && $0 > after }
                if let nearest = dropped.min() {
                    losses.append((dropped.count, nearest - after))
                }
            }
            if remaining == 0 { break }
        }
        return MintBadgeImpact(
            lost: losses.reduce(0) { $0 + $1.dropped },
            regain: losses.map(\.regain).min() ?? 0
        )
    }
}
