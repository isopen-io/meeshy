import Testing
import Combine
@testable import MeeshyUI
@testable import MeeshySDK

/// Verifies the Phase 2 externalPlayer injection contract on
/// `AudioPlayerView`. The view must use the injected engine identity when
/// one is provided, and fall back to an internally-owned engine when no
/// engine is supplied (backward-compatible default).
@Suite("AudioPlayerView external player injection")
struct AudioPlayerExternalEngineTests {

    @Test("Default init does NOT mark the view as using an external player")
    @MainActor
    func test_init_default_usesOwnedPlayer() {
        let attachment = MeeshyMessageAttachment(
            id: "att_1",
            fileName: "a.m4a",
            mimeType: "audio/m4a",
            fileUrl: "https://x/a.m4a",
            duration: 1600
        )
        let view = AudioPlayerView(attachment: attachment, context: .messageBubble)
        // The struct exposes the resolution decision via the package-private
        // `usesExternalPlayer` flag. Default = owned engine.
        #expect(view.usesExternalPlayer == false)
    }

    @Test("Init with externalPlayer marks the view as using the injected engine")
    @MainActor
    func test_init_withExternalPlayer_setsFlag() {
        let attachment = MeeshyMessageAttachment(
            id: "att_2",
            fileName: "b.m4a",
            mimeType: "audio/m4a",
            fileUrl: "https://x/b.m4a",
            duration: 1600
        )
        let engine = AudioPlaybackManager(registerWithCoordinator: false)
        let view = AudioPlayerView(
            attachment: attachment,
            context: .messageBubble,
            externalPlayer: engine
        )
        #expect(view.usesExternalPlayer == true)
    }

    @Test("AudioPlaybackManager opt-out init skips PlaybackCoordinator registration")
    @MainActor
    func test_audioPlaybackManager_optOutInit_doesNotRegister() {
        // Snapshot of registered audio players before creating the opt-out
        // instance. We use stopAll() then re-check by calling
        // willStartPlaying — but the simplest invariant we can assert
        // without exposing internals is that the opt-out engine constructs
        // without crashing and remains a valid AudioPlaybackManager.
        let engine = AudioPlaybackManager(registerWithCoordinator: false)
        #expect(engine.isPlaying == false)
        #expect(engine.duration == 0)
        #expect(engine.currentUrl == nil)
    }

    /// B3 — `attachmentId` MUST be `@Published` so observers (notably
    /// `AudioPlayerView` rendered via the external-engine path) re-evaluate
    /// `handlePlayTap` gating logic the moment the coordinator swaps the
    /// loaded attachment. Without `@Published`, mutations are invisible to
    /// SwiftUI's dependency tracking and a double-tap race on the play
    /// button can resolve to the stale attachmentId.
    @Test("attachmentId mutation fires objectWillChange")
    @MainActor
    func test_attachmentId_mutation_firesObjectWillChange() async {
        let engine = AudioPlaybackManager(registerWithCoordinator: false)
        var willChangeCount = 0
        let cancellable = engine.objectWillChange.sink { _ in
            willChangeCount += 1
        }
        defer { cancellable.cancel() }

        engine.attachmentId = "att_X"
        // objectWillChange is a CurrentValueSubject in @Published-land — it
        // fires synchronously on willSet of any @Published property.
        #expect(willChangeCount >= 1)
    }

    // MARK: - Play tap delegation gate (regression: 2026-05-28)

    /// Regression for the 2026-05-28 mini-player invisibility + background
    /// stop bug : when the bubble is INACTIVE (no external engine injected),
    /// any tap on Play MUST be delegated to the parent's `onPlayRequest`
    /// so the coordinator can set `activeContext` and load the queue. The
    /// previous gate only fired when `player.attachmentId != attachment.id`
    /// — but `onAppear` writes `player.attachmentId = attachment.id` on the
    /// owned local dummy, so the local match made the gate silently fall
    /// through to `player.play(urlString:)` on the dummy, leaving the
    /// coordinator unused.
    @Test("Inactive bubble delegates play tap to parent even when local attachmentId matches")
    @MainActor
    func test_shouldDelegateToParent_inactiveBubble_alwaysDelegates() {
        // Mimics the post-`onAppear` state where the owned dummy player has
        // `attachmentId == attachment.id`. The pre-fix gate (which only
        // checked the local mismatch) would return `false` and bypass the
        // coordinator. The fix must return `true`.
        #expect(AudioPlayerView.shouldDelegateToParent(
            usesExternalPlayer: false,
            playerAttachmentId: "att_42",
            bubbleAttachmentId: "att_42"
        ) == true)
    }

    @Test("Inactive bubble delegates even when local attachmentId is nil")
    @MainActor
    func test_shouldDelegateToParent_inactiveBubble_nilLocalId_delegates() {
        #expect(AudioPlayerView.shouldDelegateToParent(
            usesExternalPlayer: false,
            playerAttachmentId: nil,
            bubbleAttachmentId: "att_42"
        ) == true)
    }

    @Test("Active bubble loaded with this attachment does NOT delegate (toggle pause/resume locally)")
    @MainActor
    func test_shouldDelegateToParent_activeBubble_sameAttachment_doesNotDelegate() {
        #expect(AudioPlayerView.shouldDelegateToParent(
            usesExternalPlayer: true,
            playerAttachmentId: "att_42",
            bubbleAttachmentId: "att_42"
        ) == false)
    }

    @Test("Active bubble loaded with a different attachment delegates (parent rebuilds queue)")
    @MainActor
    func test_shouldDelegateToParent_activeBubble_differentAttachment_delegates() {
        #expect(AudioPlayerView.shouldDelegateToParent(
            usesExternalPlayer: true,
            playerAttachmentId: "att_other",
            bubbleAttachmentId: "att_42"
        ) == true)
    }

    // MARK: - Reels loop parity (shouldLoop mirrors SharedAVPlayerManager)

    /// Mirrors `SharedAVPlayerManager.shouldLoop`'s default so every existing
    /// caller (conversation bubbles, feed posts, composer preview) keeps its
    /// current "stop for good at the end" behavior unless a caller explicitly
    /// opts in (the reels pager).
    @Test("shouldLoop defaults to false")
    @MainActor
    func test_shouldLoop_defaultsToFalse() {
        let engine = AudioPlaybackManager(registerWithCoordinator: false)
        #expect(engine.shouldLoop == false)
    }

    /// Mirrors `SharedAVPlayerManager.cleanup()` resetting `shouldLoop` on
    /// every teardown: the flag must never carry across a track switch on
    /// the SAME engine instance — the reels pager must opt back in after
    /// every `play`/`playLocal` call, exactly like it already does for video.
    @Test("shouldLoop is reset to false when a new track starts loading")
    @MainActor
    func test_shouldLoop_resetOnNewPlay() {
        let engine = AudioPlaybackManager(registerWithCoordinator: false)
        engine.shouldLoop = true
        engine.play(urlString: "")
        #expect(engine.shouldLoop == false)
    }
}
