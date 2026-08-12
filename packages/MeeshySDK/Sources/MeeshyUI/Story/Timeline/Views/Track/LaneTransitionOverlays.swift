import SwiftUI
import MeeshySDK

/// Overlays de couture d'une lane média : losange plein (`TransitionBadge`)
/// quand une transition existe entre deux clips consécutifs, losange fantôme
/// « + » (`TransitionCreationBadge`) sinon. Leaf pur — les containers passent
/// les jonctions résolues et les callbacks, aucune observation directe.
struct LaneTransitionOverlays: View {
    let junctions: [TransitionJunction]
    let selectedId: String?
    let isDark: Bool
    let geometry: TimelineGeometry
    let laneHeight: CGFloat
    let onSelect: (String) -> Void
    let onCreate: (TransitionJunction) -> Void

    var body: some View {
        ForEach(junctions) { junction in
            if let id = junction.existingTransitionId,
               let kind = junction.existingKind,
               let duration = junction.existingDuration {
                TransitionBadge(
                    id: id,
                    kind: kind,
                    duration: duration,
                    isSelected: selectedId == id,
                    isDark: isDark,
                    anchorX: geometry.x(for: junction.anchorTime),
                    laneHeight: laneHeight,
                    onTap: { onSelect(id) },
                    onLongPress: { onSelect(id) },
                    // La durée s'édite au TransitionInspector (slider) — un
                    // drag cumulatif par frame dériverait (pattern snowball
                    // documenté sur les clip drags).
                    onDurationDelta: { _ in }
                )
                .equatable()
            } else {
                TransitionCreationBadge(
                    junctionId: junction.id,
                    anchorX: geometry.x(for: junction.anchorTime),
                    laneHeight: laneHeight,
                    isDark: isDark,
                    onCreate: { onCreate(junction) }
                )
                .equatable()
            }
        }
    }
}
