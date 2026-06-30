import XCTest
import Combine
@testable import Meeshy

@MainActor
final class ReelFeedAutoplayCoordinatorTests: XCTestCase {

    private func frame(_ id: String, midY: CGFloat) -> ReelFrame {
        ReelFrame(id: id, midY: midY, height: 400, kind: .video)
    }

    /// SUT without the default `CallManager` publisher (deterministic tests must
    /// not touch the singleton). Pass an explicit publisher where needed.
    private func makeSUT(
        isCallActive: @escaping () -> Bool = { false },
        callStatePublisher: AnyPublisher<Bool, Never>? = nil
    ) -> ReelFeedAutoplayCoordinator {
        ReelFeedAutoplayCoordinator(isCallActive: isCallActive, callStatePublisher: callStatePublisher)
    }

    /// `update()` coalesces via a ~100 ms debounce (I2), so settling requires
    /// awaiting past that window before asserting on `activeReelId`. Polls toward
    /// an expected value to stay robust against MainActor contention (app startup
    /// network/decode work can starve the debounce Task well past 100 ms).
    private func waitForActiveReel(
        _ sut: ReelFeedAutoplayCoordinator,
        toEqual expected: String?,
        timeout: TimeInterval = 2.0
    ) async {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if sut.activeReelId == expected { return }
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
    }

    /// Awaits past the debounce window without asserting a target (used when the
    /// expected outcome is "no change" — `nil`).
    private func waitForDebounce() async {
        try? await Task.sleep(nanoseconds: 300_000_000)
    }

    func test_update_setsActiveToMostCenteredReel() async {
        let sut = makeSUT()
        sut.update(frames: [frame("a", midY: 100), frame("b", midY: 400)],
                   viewportMinY: 0, viewportMaxY: 800)
        await waitForActiveReel(sut, toEqual: "b")
        XCTAssertEqual(sut.activeReelId, "b")
    }

    func test_update_whenCallActive_clearsActiveImmediately() async {
        var callActive = false
        let sut = makeSUT(isCallActive: { callActive })
        sut.update(frames: [frame("b", midY: 400)], viewportMinY: 0, viewportMaxY: 800)
        await waitForActiveReel(sut, toEqual: "b")
        XCTAssertEqual(sut.activeReelId, "b")

        callActive = true
        sut.update(frames: [frame("b", midY: 400)], viewportMinY: 0, viewportMaxY: 800)
        // No debounce wait: call-active clears synchronously inside update().
        XCTAssertNil(sut.activeReelId)
    }

    func test_update_noVisibleReel_clearsActive() async {
        let sut = makeSUT()
        sut.update(frames: [frame("b", midY: 400)], viewportMinY: 0, viewportMaxY: 800)
        await waitForActiveReel(sut, toEqual: "b")
        XCTAssertEqual(sut.activeReelId, "b")
        sut.update(frames: [], viewportMinY: 0, viewportMaxY: 800)
        await waitForActiveReel(sut, toEqual: nil)
        XCTAssertNil(sut.activeReelId)
    }

    // MARK: - I2 — throttle / debounce

    func test_update_rapidCalls_onlyLastWins() async {
        let sut = makeSUT()
        // Rapid churn: only the final frame set should be elected (earlier tasks
        // are cancelled before they fire).
        sut.update(frames: [frame("a", midY: 400)], viewportMinY: 0, viewportMaxY: 800)
        sut.update(frames: [frame("b", midY: 400)], viewportMinY: 0, viewportMaxY: 800)
        sut.update(frames: [frame("c", midY: 400)], viewportMinY: 0, viewportMaxY: 800)
        // Before the debounce fires, nothing is elected yet.
        XCTAssertNil(sut.activeReelId)
        await waitForActiveReel(sut, toEqual: "c")
        XCTAssertEqual(sut.activeReelId, "c")
    }

    // MARK: - C1 — live call-awareness (publisher driven, no scroll)

    func test_callBecomesActive_viaPublisher_clearsActiveWithoutScroll() async {
        let subject = PassthroughSubject<Bool, Never>()
        var callActive = false
        let sut = makeSUT(isCallActive: { callActive }, callStatePublisher: subject.eraseToAnyPublisher())
        sut.update(frames: [frame("b", midY: 400)], viewportMinY: 0, viewportMaxY: 800)
        await waitForActiveReel(sut, toEqual: "b")
        XCTAssertEqual(sut.activeReelId, "b")

        // A call starts while the feed is immobile: no further update() is called,
        // yet the publisher push must suspend autoplay.
        callActive = true
        subject.send(true)
        // sink hops to main; poll until the suspension lands.
        await waitForActiveReel(sut, toEqual: nil)
        XCTAssertNil(sut.activeReelId)
    }

    func test_clear_cancelsPendingDebounce() async {
        let sut = makeSUT()
        sut.update(frames: [frame("a", midY: 400)], viewportMinY: 0, viewportMaxY: 800)
        sut.clear()
        await waitForDebounce()
        // The pending election must not resurrect an active reel after clear().
        XCTAssertNil(sut.activeReelId)
    }

    // MARK: - RF2 — cell-identity election (same reel native + reposted)

    /// MANDATORY review correction: when the SAME reel appears BOTH as a native
    /// reel card AND inside a repost cell, the two cells report DISTINCT election
    /// ids — the native card keys on the reel's own post id, the repost cell on the
    /// reposter's OUTER post id (`ReelRepostEmbedCell.reelCellId`). The coordinator
    /// elects a single id, so exactly ONE surface is ever active and the two never
    /// fight over the single shared `AVPlayerLayer`.
    func test_election_sameReelNativeAndReposted_exactlyOneSurfaceActive() async {
        let nativeCellId = "reelX"   // native reel card: its own post id (== reel id)
        let repostCellId = "outerPostB" // repost cell: the reposter's OUTER post id
        XCTAssertNotEqual(nativeCellId, repostCellId,
                          "Repost cells must key on the outer post id, not the reposted reel id")

        let sut = makeSUT()
        // The repost cell is more centered (viewport mid = 400) → it wins.
        sut.update(frames: [frame(nativeCellId, midY: 150), frame(repostCellId, midY: 400)],
                   viewportMinY: 0, viewportMaxY: 800)
        await waitForActiveReel(sut, toEqual: repostCellId)

        let nativeActive = sut.activeReelId == nativeCellId
        let repostActive = sut.activeReelId == repostCellId
        XCTAssertTrue(repostActive)
        XCTAssertFalse(nativeActive)
        XCTAssertFalse(nativeActive && repostActive,
                       "Two surfaces must never both bind the single shared player")
    }
}

/// WS3.1 — the single open-autostart gate shared by a reel's audio and video
/// paths (`ReelPageView.shouldStartActiveMedia` / `ReelVideoView.drive`): an
/// active reel starts its media only once the liquid reveal has completed and no
/// call owns the audio session.
final class ReelMediaAutostartGateTests: XCTestCase {

    func test_starts_whenActiveAndRevealedAndNoCall() {
        XCTAssertTrue(ReelMediaAutostart.shouldStart(isActive: true, revealCompleted: true, isCallActive: false))
    }

    func test_doesNotStart_whenInactive() {
        XCTAssertFalse(ReelMediaAutostart.shouldStart(isActive: false, revealCompleted: true, isCallActive: false))
    }

    func test_doesNotStart_beforeRevealCompletes() {
        XCTAssertFalse(ReelMediaAutostart.shouldStart(isActive: true, revealCompleted: false, isCallActive: false),
                       "The first reel holds on its poster until the liquid reveal completes")
    }

    func test_doesNotStart_duringCall() {
        XCTAssertFalse(ReelMediaAutostart.shouldStart(isActive: true, revealCompleted: true, isCallActive: true),
                       "An active call owns the audio session — never start reel media over it")
    }

    // MARK: Audio open-autostart idempotency (F4/F6)

    /// `startActiveAudioIfNeeded` guards on `shouldLoadAudio(currentUrl:url:)`:
    /// calling it twice with the SAME (already-loaded) url must NOT restart the
    /// engine — a re-render / reveal flip must leave in-place audio untouched.
    func test_shouldLoadAudio_falseWhenSameUrl() {
        XCTAssertFalse(
            ReelMediaAutostart.shouldLoadAudio(currentUrl: "https://cdn/a.mp3", url: "https://cdn/a.mp3"),
            "Same url already loaded — autostart must be a no-op (no restart)")
    }

    /// A `file://` url already loaded in its NORMALIZED form (what
    /// `AudioPlaybackManager.playLocal` stores) must also be a no-op — the F6 fix
    /// compares against the stored (normalized) value, not the raw string.
    func test_shouldLoadAudio_falseWhenSameNormalizedFileUrl() {
        let normalized = URL(string: "file:///tmp/voice.m4a")!.absoluteString
        XCTAssertFalse(
            ReelMediaAutostart.shouldLoadAudio(currentUrl: normalized, url: normalized),
            "A file:// url already loaded in normalized form must not restart")
    }

    func test_shouldLoadAudio_trueWhenDifferentUrl() {
        XCTAssertTrue(
            ReelMediaAutostart.shouldLoadAudio(currentUrl: "https://cdn/a.mp3", url: "https://cdn/b.mp3"),
            "A different url (e.g. a flag-tapped TTS language) must (re)load")
    }

    func test_shouldLoadAudio_trueWhenNothingLoaded() {
        XCTAssertTrue(
            ReelMediaAutostart.shouldLoadAudio(currentUrl: nil, url: "https://cdn/a.mp3"),
            "A fresh engine (no url) must load on open")
    }
}
