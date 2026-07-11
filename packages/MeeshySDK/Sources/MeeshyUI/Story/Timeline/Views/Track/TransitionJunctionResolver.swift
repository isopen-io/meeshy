import Foundation
import MeeshySDK

/// Jonction temporelle entre deux clips média consécutifs — le point
/// d'ancrage des `TransitionBadge` (transition existante) et des affordances
/// de création (`TransitionCreationBadge`). Résolution PURE, partagée par
/// Quick et Pro, testable sans SwiftUI.
public nonisolated struct TransitionJunction: Equatable, Identifiable, Sendable {
    public let fromClipId: String
    public let toClipId: String
    /// Milieu entre la fin du clip amont et le début du clip aval — les deux
    /// peuvent se chevaucher (crossfade) ou laisser un trou, l'ancre reste
    /// visuellement centrée sur la couture.
    public let anchorTime: Float
    /// Renseigné quand une `StoryClipTransition` relie déjà cette paire.
    public let existingTransitionId: String?
    public let existingKind: StoryTransitionKind?
    public let existingDuration: Float?

    public var id: String { "\(fromClipId)→\(toClipId)" }
}

public enum TransitionJunctionResolver {

    /// Paires de clips média consécutifs dans le TEMPS (ordre startTime),
    /// candidates à une transition. Exclut le fond (`isBackground`) et les
    /// clips synthétiques de l'éditeur — le compositor ne transitionne que
    /// les médias foreground réels.
    public nonisolated static func resolve(
        project: TimelineProject,
        slideDuration: Float
    ) -> [TransitionJunction] {
        let clips = project.mediaObjects
            .filter { $0.isBackground != true }
            .filter { !StoryComposerViewModel.isSyntheticTimelineClipId($0.id) }
            .sorted { ($0.startTime ?? 0) < ($1.startTime ?? 0) }
        guard clips.count >= 2 else { return [] }

        return zip(clips, clips.dropFirst()).map { from, to in
            let fromStart = Float(from.startTime ?? 0)
            let fromEnd = fromStart + TimelineGeometry.effectiveClipDuration(
                startTime: fromStart,
                duration: from.duration.map { Float($0) },
                slideDuration: slideDuration)
            let toStart = Float(to.startTime ?? 0)
            let existing = project.clipTransitions.first {
                $0.fromClipId == from.id && $0.toClipId == to.id
            }
            return TransitionJunction(
                fromClipId: from.id,
                toClipId: to.id,
                anchorTime: (fromEnd + toStart) / 2,
                existingTransitionId: existing?.id,
                existingKind: existing?.kind,
                existingDuration: existing?.duration
            )
        }
    }

    /// Jonctions dont le clip AMONT vit sur la lane donnée — c'est la lane
    /// qui héberge le badge (compact Quick : tous les clips d'un type sur une
    /// lane ; Pro/déployé : une lane par clip).
    public nonisolated static func junctions(
        for laneClipIds: [String],
        in all: [TransitionJunction]
    ) -> [TransitionJunction] {
        all.filter { laneClipIds.contains($0.fromClipId) }
    }
}
