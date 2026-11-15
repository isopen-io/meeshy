import CoreGraphics

/// The bookkeeping of the reader's parent drag (`unifiedDragGesture`, #13135):
/// the axis the gesture took, the surface state frozen at its start, the claims
/// of the surfaces it yields to, and the purge that recovers a lost `onEnded`.
///
/// **The drag pause is STATE-DRIVEN, never an event.** `isInFlight` feeds
/// `playbackCauses.gestureInFlight`: a `pauseTimer()` posted at the axis
/// decision needed a symmetric `resumeTimer()` that SwiftUI skips whenever a
/// concurrent recognizer (a `ScrollView`, the reaction strip) wins the touch
/// sequence — the story then stayed frozen. Backed by the axis, playback
/// resumes on its own as soon as the axis falls back to `.undecided`.
nonisolated struct StoryReaderDragTracker: Equatable {
    enum Axis: Equatable { case undecided, horizontal, vertical }

    /// How much one axis must lead the other before the gesture commits to it.
    static let axisLead: CGFloat = 8

    private(set) var axis: Axis = .undecided

    /// `hasActiveReaderFeature` FROZEN at the vertical axis decision. The
    /// release cannot reread the live state: the canvas gesture overlay closes
    /// the open surface at touch-down, so at touch-up the live value is already
    /// `false` and the drag concluded `.dismissViewer` — the user who swiped
    /// down to close an overlay lost the story with it.
    private var hadActiveFeatureAtStart = false

    /// Set by `StoryGestureOverlayView` when the TOUCH-DOWN of the current touch
    /// closed a reader surface. Required complement of the frozen value above,
    /// which is taken after 15 pt of movement, once the child has already
    /// closed the surface. Consumed by `finish()` and `reset()`, re-armed at
    /// every touch-down: it can never neutralise the NEXT gesture.
    var featureConsumedByTouch = false

    /// The reaction strip claimed the current drag (`StoryReactionStripGesture`).
    /// This drag is simultaneous, so it cannot be subordinated by priority: the
    /// strip only wins if the drag YIELDS, and it only knows by reading this.
    var reactionStripOwnsDrag = false

    /// The drag was born on the composer (#8431, `StoryComposerGesture`).
    var composerOwnsDrag = false

    /// Purge token for the PRIVATE touch state of `StoryGestureOverlayView` and
    /// of the group interlude, bumped by `reset()` on the non-nominal paths.
    private(set) var resetToken = 0

    /// A gesture holds the story still while it is in flight.
    var isInFlight: Bool { axis != .undecided }

    /// Another surface owns this drag: the reader yields every tick.
    var isClaimedElsewhere: Bool { reactionStripOwnsDrag || composerOwnsDrag }

    /// Decides the axis on the first significant movement, then keeps it for the
    /// whole gesture. Vertical accepts both directions (swipe up = fullscreen).
    /// The horizontal yield is consulted BEFORE committing to horizontal — the
    /// only instant the race between the two `onChanged` can be lost.
    mutating func track(dx: CGFloat, dy: CGFloat, featureAtStart: @autoclosure () -> Bool,
                        horizontalYields: () -> Bool) -> Axis {
        guard axis == .undecided else { return axis }
        if abs(dx) > abs(dy) + Self.axisLead {
            guard !horizontalYields() else { return .undecided }
            axis = .horizontal
        } else if abs(dy) > abs(dx) + Self.axisLead {
            axis = .vertical
            hadActiveFeatureAtStart = featureAtStart()
        }
        return axis
    }

    /// Ends the gesture: its axis, and whether a surface was open at its start
    /// — from EITHER source. Both snapshots are consumed: they only hold for
    /// the gesture that just ended.
    mutating func finish() -> (axis: Axis, hadActiveFeature: Bool) {
        let ended = (axis: axis, hadActiveFeature: hadActiveFeatureAtStart || featureConsumedByTouch)
        axis = .undecided
        hadActiveFeatureAtStart = false
        featureConsumedByTouch = false
        return ended
    }

    /// The anti-sticky-state net. SwiftUI does not call `onEnded` when a
    /// concurrent recognizer takes the touch sequence: without this purge the
    /// axis stayed stuck (the next decision is skipped), the snapshots and
    /// claims leaked into the next gesture, and the overlay treated every
    /// following touch as a drag in progress.
    mutating func reset() {
        axis = .undecided
        hadActiveFeatureAtStart = false
        featureConsumedByTouch = false
        reactionStripOwnsDrag = false
        composerOwnsDrag = false
        resetToken &+= 1
    }

    /// A slide change frees a stuck axis — the natural recovery path of the
    /// state-driven pause — without touching the snapshots of a live touch.
    mutating func releaseAxis() { axis = .undecided }
}
