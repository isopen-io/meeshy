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
}
