import Foundation
import CoreGraphics

/// Pure value struct that tracks "which clip is currently selected" and
/// "which clip is being dragged right now". Lives next to `TimelineViewModel`
/// so it can be passed by value into leaf views without triggering observation.
public struct ClipSelectionState: Equatable, Sendable {

    public struct ActiveDrag: Equatable, Sendable {
        public nonisolated let clipId: String
        public nonisolated let originalStartTime: Float
        public nonisolated var currentStartTime: Float
        public nonisolated var snappedTo: SnappedKind?

        public enum SnappedKind: String, Sendable {
            case playhead
            case clipStart
            case clipEnd
            case keyframe
            case grid
        }
    }

    public nonisolated private(set) var selectedClipId: String?
    public nonisolated private(set) var activeDrag: ActiveDrag?

    public nonisolated init(selectedClipId: String? = nil, activeDrag: ActiveDrag? = nil) {
        self.selectedClipId = selectedClipId
        self.activeDrag = activeDrag
    }

    public nonisolated var isDragging: Bool { activeDrag != nil }

    public nonisolated func isSelected(_ clipId: String) -> Bool { selectedClipId == clipId }

    // MARK: - Mutations

    public nonisolated mutating func select(_ clipId: String) {
        selectedClipId = clipId
    }

    public nonisolated mutating func deselect() {
        selectedClipId = nil
    }

    public nonisolated mutating func beginDrag(clipId: String, originalStartTime: Float) {
        activeDrag = ActiveDrag(
            clipId: clipId,
            originalStartTime: originalStartTime,
            currentStartTime: originalStartTime,
            snappedTo: nil
        )
    }

    public nonisolated mutating func updateDrag(currentStartTime: Float, snappedTo: ActiveDrag.SnappedKind?) {
        guard var drag = activeDrag else { return }
        drag.currentStartTime = currentStartTime
        drag.snappedTo = snappedTo
        activeDrag = drag
    }

    public nonisolated mutating func endDrag() {
        activeDrag = nil
    }
}
