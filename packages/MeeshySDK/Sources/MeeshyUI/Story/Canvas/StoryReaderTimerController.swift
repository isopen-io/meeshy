import Foundation
import QuartzCore

/// Behaviour contract for the slide-duration timer that drives the
/// reader's auto-advance arrow ring + countdown.
///
/// The protocol exists so unit tests can inject a clock-free stub and
/// exercise gating semantics without spinning a real `CADisplayLink`.
/// All members are `@MainActor` because the timer lives next to the
/// canvas view that drives it — running the auto-advance off the main
/// thread would race with the `StoryCanvasUIView.rebuildLayers()` tick.
@MainActor
public protocol StoryReaderTimerControlling: AnyObject {
    /// `true` once `markContentReady(slideId:)` has been called for the
    /// current slide. Read by the reader UI to decide whether to render
    /// the spinning loader or the active countdown.
    var isActive: Bool { get }

    /// Elapsed fraction `[0, 1]` of the configured slide duration. Stays
    /// at `0` while the timer is pending.
    var progress: Double { get }

    /// Identifier of the slide the timer is currently tracking. `nil`
    /// before the first `setCurrentSlide(...)` call.
    var currentSlideId: String? { get }

    /// Switches the timer to a new slide. Resets `progress` to 0 and
    /// puts the timer back into the `pending` state — `markContentReady`
    /// must be called for `id` before the countdown will start.
    func setCurrentSlide(id: String, duration: TimeInterval)

    /// Signals that the canvas associated with `slideId` has finished
    /// loading its background media (image bytes / video ready / static
    /// color). The timer only starts if `slideId == currentSlideId` —
    /// readiness signals from the off-screen prefetch window (`N-1`, `N+1`)
    /// are intentionally ignored so the user never races a countdown for
    /// a slide they are not yet watching.
    func markContentReady(slideId: String)

    /// Hard-resets the timer back to `pending` for the current slide.
    /// Used by the reader on tap-to-pause / app backgrounding.
    func reset()

    /// Test-only seam : advances the internal clock by `seconds` and
    /// triggers the progress callback chain as if `seconds` of wall
    /// time had elapsed. Lets unit tests assert the gating contract
    /// without sleeping or running a real `CADisplayLink`.
    func _advanceClockForTesting(by seconds: TimeInterval)
}

/// Drives the reader's slide-duration countdown with gating on the
/// canvas readiness signal.
///
/// Lifecycle, per slide :
/// 1. `setCurrentSlide(id:duration:)` → enters `pending`. `progress == 0`,
///    `isActive == false`. The display link is started but the elapsed
///    accumulator is held at 0.
/// 2. `markContentReady(slideId:)` is called once the matching
///    `StoryCanvasUIView` reports `onContentReady`. If `slideId` matches
///    the current slide, the timer transitions to `active` and starts
///    accumulating wall time. Readiness signals for any other id are
///    discarded.
/// 3. `progress` reaches `1.0` → `onProgressChange` fires with `1.0`,
///    then `onCompletion` fires once. The display link stays running
///    until the next `setCurrentSlide` or `reset`.
///
/// The internal display link is created lazily on the first
/// `setCurrentSlide` and torn down on `deinit`. Tests inject a
/// deterministic clock by skipping the display link and calling
/// `_advanceClockForTesting(by:)` directly.
///
/// ### Integration with the reader (`feat/canvas-reader-prefetch`)
///
/// The prefetcher MUST wire each prefetched canvas's `onContentReady`
/// callback into this controller's `markContentReady` BEFORE attaching
/// the canvas to the visible viewer hierarchy:
///
/// ```swift
/// let canvas = prefetcher.view(for: item.id) ?? StoryCanvasUIView(slide: ..., mode: .play)
/// canvas.onContentReady = { [weak self] in
///     self?.timer.markContentReady(slideId: item.id)
/// }
/// timer.setCurrentSlide(id: item.id, duration: item.slideDuration)
/// // promote canvas into visible slot — layoutSubviews → rebuildLayers
/// // resets readiness and fires onContentReady once content lands.
/// ```
///
/// Inheriting from `NSObject` is required so `CADisplayLink`'s
/// target-action selector machinery can find `@objc tick(_:)`.
@MainActor
public final class StoryReaderTimerController: NSObject, StoryReaderTimerControlling {

    // MARK: - Configuration

    /// Callback fired on every display-link tick once the timer is
    /// active. Receives the current `[0, 1]` progress value. Stays
    /// at `0` while pending (no spurious ticks before readiness).
    public var onProgressChange: ((Double) -> Void)?

    /// Fired exactly once per slide when `progress` reaches `1.0`.
    /// Cleared on the next `setCurrentSlide` call.
    public var onCompletion: (() -> Void)?

    // MARK: - State

    public private(set) var currentSlideId: String?
    public private(set) var progress: Double = 0
    public private(set) var isActive: Bool = false

    private var duration: TimeInterval = 0
    private var elapsed: TimeInterval = 0
    private var completionFired: Bool = false

    /// `CADisplayLink` driving the countdown. Optional so tests that
    /// drive the timer via `_advanceClockForTesting(by:)` never have
    /// to instantiate one. Created lazily on the first real
    /// `setCurrentSlide` call where `useDisplayLink == true`.
    private var displayLink: CADisplayLink?
    private var lastTick: CFTimeInterval?

    /// `false` in tests (skips CADisplayLink instantiation so a single
    /// test process can spin many controllers without piling up
    /// runloop sources). `true` in production where the canvas drives
    /// the timer from the slide-viewer.
    private let useDisplayLink: Bool

    // MARK: - Init

    /// - Parameter useDisplayLink : Set to `false` in unit tests to
    ///   skip the `CADisplayLink` sub-system entirely and drive the
    ///   timer through `_advanceClockForTesting(by:)` instead.
    public init(useDisplayLink: Bool = true) {
        self.useDisplayLink = useDisplayLink
        super.init()
    }

    deinit {
        displayLink?.invalidate()
    }

    // MARK: - StoryReaderTimerControlling

    public func setCurrentSlide(id: String, duration: TimeInterval) {
        currentSlideId = id
        self.duration = max(0, duration)
        elapsed = 0
        progress = 0
        isActive = false
        completionFired = false
        lastTick = nil
        // Pending state — display link is allowed to tick (it will
        // observe `isActive == false` and refuse to advance the
        // accumulator). Starting the link here means a synchronous
        // `markContentReady` immediately followed by ticks does not
        // miss the first frame.
        startDisplayLinkIfNeeded()
        onProgressChange?(0)
    }

    public func markContentReady(slideId: String) {
        guard slideId == currentSlideId, !isActive else { return }
        isActive = true
        lastTick = nil
        // Fire a tick immediately so consumers redraw the spinning
        // loader → countdown transition without waiting for the next
        // displayLink frame.
        onProgressChange?(progress)
    }

    public func reset() {
        elapsed = 0
        progress = 0
        isActive = false
        completionFired = false
        lastTick = nil
        onProgressChange?(0)
    }

    public func _advanceClockForTesting(by seconds: TimeInterval) {
        advanceClock(by: seconds)
    }

    // MARK: - Internals

    private func startDisplayLinkIfNeeded() {
        guard useDisplayLink, displayLink == nil else { return }
        let link = CADisplayLink(target: self, selector: #selector(tick(_:)))
        link.preferredFrameRateRange = CAFrameRateRange(minimum: 30, maximum: 60, preferred: 60)
        link.add(to: .main, forMode: .common)
        displayLink = link
    }

    @objc private func tick(_ link: CADisplayLink) {
        guard isActive else {
            // Pending : record but do not advance the accumulator. The
            // next `markContentReady` call will reset `lastTick` so
            // the first active tick advances by zero (no jump).
            lastTick = link.timestamp
            return
        }
        if let last = lastTick {
            advanceClock(by: link.timestamp - last)
        }
        lastTick = link.timestamp
    }

    /// Test-only override : runs the active-state logic deterministically
    /// regardless of whether the display link is wired. Used by the gating
    /// test suite which constructs `StoryReaderTimerController(useDisplayLink: false)`.
    private func advanceClock(by delta: TimeInterval) {
        guard isActive, duration > 0 else { return }
        elapsed = min(duration, elapsed + max(0, delta))
        progress = elapsed / duration
        onProgressChange?(progress)
        if progress >= 1, !completionFired {
            completionFired = true
            onCompletion?()
        }
    }
}
