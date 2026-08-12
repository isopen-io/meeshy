import SwiftUI
import MeeshySDK

/// Marqueurs de keyframes d'une lane : petits losanges posés sur les clips
/// aux temps absolus des keyframes. Tap → sélection du keyframe (le bus de
/// sélection route vers le `KeyframeInspector` en Pro). Leaf pur.
struct LaneKeyframeOverlays: View {
    let markers: [KeyframeMarker]
    let selectedId: String?
    let geometry: TimelineGeometry
    let laneHeight: CGFloat
    let onSelect: (String) -> Void

    var body: some View {
        ForEach(markers) { marker in
            KeyframeMarkerView(
                keyframeId: marker.keyframeId,
                absoluteTime: marker.absoluteTime,
                geometry: geometry,
                laneHeight: laneHeight,
                isSelected: selectedId == marker.keyframeId,
                onTap: { onSelect(marker.keyframeId) },
                onLongPress: { onSelect(marker.keyframeId) },
                // Le déplacement temporel s'édite au KeyframeInspector — un
                // drag cumulatif par frame dériverait (pattern snowball).
                onDragDelta: { _ in }
            )
            .equatable()
        }
    }
}
