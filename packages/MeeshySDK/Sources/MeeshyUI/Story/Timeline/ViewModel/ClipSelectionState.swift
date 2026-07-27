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

    /// Clip dont la FICHE d'édition est présentée. Distinct du surlignage :
    /// toucher une piste la surligne, la fiche ne s'ouvre qu'au double tap
    /// (directive user 2026-07-27). Auparavant la sheet était pilotée par un
    /// binding sur `selectedClipId` — sélectionner, c'était présenter, et le
    /// moindre tap recouvrait la timeline qu'on était en train de lire.
    ///
    /// Invariant : `inspectedClipId != nil ⟹ inspectedClipId == selectedClipId`.
    /// C'est lui qui permet aux `resolve*Snapshot` de continuer à lire
    /// `selectedClipId` sans être paramétrés par un identifiant.
    public nonisolated private(set) var inspectedClipId: String?

    public nonisolated private(set) var activeDrag: ActiveDrag?

    public nonisolated init(selectedClipId: String? = nil,
                            inspectedClipId: String? = nil,
                            activeDrag: ActiveDrag? = nil) {
        self.selectedClipId = selectedClipId
        self.inspectedClipId = inspectedClipId
        self.activeDrag = activeDrag
    }

    public nonisolated var isDragging: Bool { activeDrag != nil }

    public nonisolated func isSelected(_ clipId: String) -> Bool { selectedClipId == clipId }

    // MARK: - Mutations

    /// Surligne un clip. Referme la fiche ouverte : sans ça, elle resterait
    /// posée sur un clip que l'utilisateur ne regarde plus, et l'invariant
    /// `inspectedClipId == selectedClipId` tomberait.
    public nonisolated mutating func select(_ clipId: String) {
        selectedClipId = clipId
        inspectedClipId = nil
    }

    /// Ouvre la fiche d'édition d'un clip, en le surlignant.
    public nonisolated mutating func inspect(_ clipId: String) {
        selectedClipId = clipId
        inspectedClipId = clipId
    }

    /// Referme la fiche SANS désélectionner — l'utilisateur retrouve la piste
    /// qu'il consultait, surlignée.
    public nonisolated mutating func endInspection() {
        inspectedClipId = nil
    }

    public nonisolated mutating func deselect() {
        selectedClipId = nil
        inspectedClipId = nil
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
