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

    /// `true` while the countdown is frozen by `setPaused(true)`.
    var isPaused: Bool { get }

    /// Freezes / resumes the countdown WITHOUT losing the elapsed
    /// accumulator — the reader's UI pauses (sheets, composer focus,
    /// long-press, transitions, preemption) all funnel here. Resuming
    /// continues from the frozen elapsed value with no jump. Cleared
    /// by `setCurrentSlide` and `reset()` — a new slide always starts
    /// un-paused.
    func setPaused(_ paused: Bool)

    /// `true` while the countdown is frozen because the slide's primary media
    /// playback has stalled (buffering / `.waitingToPlayAtSpecifiedRate` /
    /// unexpected pause). DISTINCT from `isPaused` (user/lifecycle) — the two
    /// freeze inputs are independent so neither clobbers the other. The timeline
    /// advances only when `isActive && !isPaused && !isPlaybackStalled`.
    var isPlaybackStalled: Bool { get }

    /// Freezes / resumes the countdown on a media-playback stall, independently
    /// of `setPaused`. The reader wires the canvas's `onPlaybackProgressing`
    /// signal here so the progress bar tracks ACTUAL playback. Resuming re-seeds
    /// the tick accumulator so there is no jump — the stalled span is never
    /// integrated. Cleared by `setCurrentSlide` and `reset()` — a new slide
    /// always starts un-stalled. A slide with no gated media never calls this.
    func setPlaybackStalled(_ stalled: Bool)

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
/// `setCurrentSlide` and torn down by `invalidate()` (deterministic,
/// called by the reader's `onDisappear`) or by `deinit` as a backstop —
/// reachable because the link targets a weak proxy, never `self`.
/// Tests inject a deterministic clock by skipping the display link and
/// calling `_advanceClockForTesting(by:)` directly.
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
/// Inherits from `NSObject` for historical target-action compatibility;
/// the display link now targets the internal `WeakLinkTarget` proxy so the
/// controller itself is never retained by the run loop.
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

    /// Anti-freeze content-ready failsafe. If `markContentReady(slideId:)` is
    /// never called for the current slide within this many seconds of pending
    /// (a `Kind` the per-layer readiness evaluation doesn't cover, an eval that
    /// is never re-triggered, a canvas retained off-window…), the timer
    /// force-activates so the story auto-advances instead of freezing with the
    /// ring stuck at 0. Independent of the per-layer 2 s failsafes — it is the
    /// last line of defence at the single auto-advance choke point. Set to `0`
    /// to disable (tests that assert pure gating semantics). Paused / backgrounded
    /// pending time is NOT counted.
    public var contentReadyFailsafe: TimeInterval = 6.0

    // MARK: - State

    public private(set) var currentSlideId: String?
    public private(set) var progress: Double = 0
    public private(set) var isActive: Bool = false
    public private(set) var isPaused: Bool = false
    public private(set) var isPlaybackStalled: Bool = false

    private var duration: TimeInterval = 0
    private var elapsed: TimeInterval = 0
    private var completionFired: Bool = false
    /// Accumulated pending (pre-content-ready) time, gating `contentReadyFailsafe`.
    private var pendingElapsed: TimeInterval = 0

    /// `CADisplayLink` driving the countdown. Optional so tests that
    /// drive the timer via `_advanceClockForTesting(by:)` never have
    /// to instantiate one. Created lazily on the first real
    /// `setCurrentSlide` call where `useDisplayLink == true`.
    // `nonisolated(unsafe)` so the `nonisolated deinit` can invalidate it
    // without crossing the MainActor isolation boundary. All mutations happen
    // in MainActor methods (setCurrentSlide / startDisplayLinkIfNeeded /
    // stopDisplayLink), so single-context mutation is preserved.
    private nonisolated(unsafe) var displayLink: CADisplayLink?
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

    // `nonisolated` (l'intention documentée ci-dessus l.118) : sans ce mot-clé,
    // le deinit @MainActor implicite est ISOLÉ et passe par
    // `swift_task_deinitOnExecutorMainActorBackDeploy`, dont le shim double-free
    // le TaskLocal scope et abort (SIGABRT) — c'est ce crash qui faisait tomber
    // le bundle via le teardown de StoryCanvasUIView (qui possède ce controller).
    nonisolated deinit {
        displayLink?.invalidate()
    }

    // MARK: - StoryReaderTimerControlling

    public func setCurrentSlide(id: String, duration: TimeInterval) {
        currentSlideId = id
        self.duration = max(0, duration)
        elapsed = 0
        progress = 0
        isActive = false
        isPaused = false
        isPlaybackStalled = false
        completionFired = false
        pendingElapsed = 0
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
        isPaused = false
        isPlaybackStalled = false
        completionFired = false
        pendingElapsed = 0
        lastTick = nil
        onProgressChange?(0)
    }

    public func setPaused(_ paused: Bool) {
        guard paused != isPaused else { return }
        isPaused = paused
        // Resume without a jump : the next display-link tick re-seeds
        // `lastTick` instead of integrating the whole paused span.
        if !paused { lastTick = nil }
    }

    public func setPlaybackStalled(_ stalled: Bool) {
        guard stalled != isPlaybackStalled else { return }
        isPlaybackStalled = stalled
        // Resume without a jump : same re-seed contract as `setPaused`. The
        // span spent stalled is discarded, not integrated, when playback resumes.
        if !stalled { lastTick = nil }
    }

    public func _advanceClockForTesting(by seconds: TimeInterval) {
        integrate(by: seconds)
    }

    /// Teardown déterministe : invalide le display link 60 Hz et coupe les
    /// callbacks (qui capturent l'état du viewer). À appeler depuis le
    /// `onDisappear` du reader. Sans cet appel le run loop garderait la
    /// source active jusqu'au `deinit` ; les callbacks sont re-câblés et le
    /// link recréé par `setCurrentSlide` au prochain install du pipeline.
    public func invalidate() {
        displayLink?.invalidate()
        displayLink = nil
        onProgressChange = nil
        onCompletion = nil
        reset()
    }

    // MARK: - Internals

    private func startDisplayLinkIfNeeded() {
        guard useDisplayLink, displayLink == nil else { return }
        // Proxy weak partagé : le link ne retient jamais le controller —
        // le `deinit` (backstop) reste atteignable, et un tick orphelin
        // s'auto-invalide. Cf. WeakDisplayLinkTarget.
        let link = WeakDisplayLinkTarget.makeLink { [weak self] link in
            guard let self else {
                link.invalidate()
                return
            }
            self.tick(link)
        }
        link.preferredFrameRateRange = CAFrameRateRange(minimum: 30, maximum: 60, preferred: 60)
        link.add(to: .main, forMode: .common)
        displayLink = link
    }

    @objc private func tick(_ link: CADisplayLink) {
        // All gating (active countdown vs pending failsafe vs paused/stalled) is
        // delegated to `integrate`. `lastTick == nil` after a (re)seed skips the
        // first delta so resume from pause/stall/pending has no jump.
        if let last = lastTick {
            integrate(by: link.timestamp - last)
        }
        lastTick = link.timestamp
    }

    /// Integrates `delta` seconds into the countdown when active, or into the
    /// pending content-ready failsafe when not yet active. Runs deterministically
    /// regardless of whether the display link is wired — the gating test suite
    /// drives it through `_advanceClockForTesting(by:)` with `useDisplayLink: false`.
    private func integrate(by delta: TimeInterval) {
        let d = max(0, delta)
        guard isActive else {
            // Pending : arm the anti-freeze failsafe. Paused / backgrounded time
            // is not counted (guard on `isPaused`); a disabled failsafe (0) never
            // force-activates, preserving pure gating semantics for tests.
            guard !isPaused, contentReadyFailsafe > 0 else { return }
            pendingElapsed += d
            if pendingElapsed >= contentReadyFailsafe, let id = currentSlideId {
                markContentReady(slideId: id)
            }
            return
        }
        guard !isPaused, !isPlaybackStalled, duration > 0 else { return }
        elapsed = min(duration, elapsed + d)
        progress = elapsed / duration
        onProgressChange?(progress)
        if progress >= 1, !completionFired {
            completionFired = true
            onCompletion?()
        }
    }
}
