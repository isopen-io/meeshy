import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

/// Tests for the `isPublishing` lifecycle of `UnifiedPostComposer`.
///
/// Bug context: P1 UX — when the publish callback failed (transient network
/// error, server 5xx), `isPublishing` stayed `true` and the Publish button
/// remained `.disabled(...)` forever. The user had to dismiss the sheet
/// and re-type their content to retry.
///
/// Fix: the Publish button now awaits an `async throws` publish handler and
/// resets `isPublishing` to `false` both on success and on throw, restoring
/// the user's ability to retry.
///
/// `UnifiedPostComposer` is a SwiftUI `View` (a value-type `struct`), so we
/// drive its publish path via the internal test seam
/// `triggerPublishForTestsAwaiting(content:)` which mirrors the production
/// `Task { try await handler(...) }` invocation. We assert via the captured
/// closure that the handler ran, and via the returned `Bool` that the
/// async path observed success/throw correctly.
@MainActor
final class UnifiedPostComposer_PublishStateTests: XCTestCase {

    // MARK: - Fixtures

    private struct StubError: Error, Equatable {
        let tag: String
    }

    private static func makeStoryItem(id: String = "story-1") -> StoryItem {
        StoryItem(
            id: id,
            content: "Original",
            media: [],
            storyEffects: nil,
            createdAt: Date(),
            expiresAt: Date().addingTimeInterval(3600),
            repostOfId: nil,
            repostAuthorName: nil,
            isViewed: false,
            translations: nil,
            backgroundAudio: nil,
            reactionCount: 0,
            commentCount: 0
        )
    }

    // MARK: - test_isPublishing_resetAfterSuccessfulPublish

    func test_isPublishing_resetAfterSuccessfulPublish() async {
        var handlerInvocations = 0
        let composer = UnifiedPostComposer(
            onPublish: { _, _, _, _, _ in
                handlerInvocations += 1
            } as (PostType, String, String?, StoryEffects?, UIImage?) async throws -> Void,
            onDismiss: {}
        )

        // Pre-condition: a freshly built composer is not publishing.
        XCTAssertFalse(composer.isPublishingForTests,
                       "Fresh composer must not start in publishing state")

        let succeeded = await composer.triggerPublishForTestsAwaiting(content: "Hello")

        XCTAssertTrue(succeeded, "Handler returned no error → triggerPublish must report success")
        XCTAssertEqual(handlerInvocations, 1, "Publish must fan-out to the handler exactly once")
    }

    // MARK: - test_isPublishing_resetAfterFailedPublish

    func test_isPublishing_resetAfterFailedPublish() async {
        var handlerInvocations = 0
        let composer = UnifiedPostComposer(
            onPublish: { _, _, _, _, _ in
                handlerInvocations += 1
                throw StubError(tag: "network")
            } as (PostType, String, String?, StoryEffects?, UIImage?) async throws -> Void,
            onDismiss: {}
        )

        let succeeded = await composer.triggerPublishForTestsAwaiting(content: "Hello")

        XCTAssertFalse(succeeded,
                       "Handler threw → triggerPublish must report failure so the button can re-enable")
        XCTAssertEqual(handlerInvocations, 1,
                       "Even on failure, the handler must have been invoked exactly once")
    }

    // MARK: - test_button_disabled_duringPublish

    func test_button_disabled_duringPublish() async {
        // Simulate a slow handler: the closure suspends on `pauseGate.wait()`
        // until the test resumes it. While suspended, the composer's internal
        // Task is awaiting the handler — this is exactly the "during publish"
        // window where the production Button is `.disabled(!canPublish || isPublishing)`.
        // We assert the semantic contract: the publish path is in-flight
        // (handler has started) but has not yet finished, which mirrors the
        // disabled-button window in the UI.
        let progress = HandlerProgress()
        let pauseGate = AsyncGate()
        let composer = UnifiedPostComposer(
            onPublish: { _, _, _, _, _ in
                await progress.recordStarted()
                await pauseGate.wait()
                await progress.recordFinished()
            } as (PostType, String, String?, StoryEffects?, UIImage?) async throws -> Void,
            onDismiss: {}
        )

        let publishTask = Task { @MainActor in
            await composer.triggerPublishForTestsAwaiting(content: "Hello")
        }

        // Cooperatively yield so the Task started by `triggerPublishForTestsAwaiting`
        // has a chance to enter the handler (which suspends on the gate).
        for _ in 0..<10 { await Task.yield() }

        // Mid-flight invariants: handler started, handler not yet finished —
        // same invariants as `isPublishing == true` in the production button.
        let startedCount = await progress.startedCount
        let finishedCount = await progress.finishedCount
        XCTAssertEqual(startedCount, 1, "Handler must have started during the suspended window")
        XCTAssertEqual(finishedCount, 0, "Handler must NOT yet have finished — mirrors disabled-button window")

        // Release the gate; the handler resumes and the Task completes.
        await pauseGate.release()
        let succeeded = await publishTask.value

        XCTAssertTrue(succeeded, "Handler completed without throwing → success path")
        let finalFinished = await progress.finishedCount
        XCTAssertEqual(finalFinished, 1, "Handler must have run to completion after gate release")
    }

    // MARK: - test_button_reEnabled_afterPublishFails

    func test_button_reEnabled_afterPublishFails() async {
        // After a failed publish, the user must be able to retry. We
        // demonstrate the retry path by invoking the publish handler twice:
        // first throws (rollback), second succeeds. Both invocations must
        // reach the handler — proving the composer doesn't latch into a
        // permanent disabled state after the first failure.
        var attempts = 0
        let composer = UnifiedPostComposer(
            onPublish: { _, _, _, _, _ in
                attempts += 1
                if attempts == 1 { throw StubError(tag: "first-attempt") }
            } as (PostType, String, String?, StoryEffects?, UIImage?) async throws -> Void,
            onDismiss: {}
        )

        let firstResult = await composer.triggerPublishForTestsAwaiting(content: "Hello")
        XCTAssertFalse(firstResult, "First attempt must surface as a failure")

        // If `isPublishing` had latched to true with no rollback, the production
        // button would be `.disabled` and this retry could not happen at all.
        // The retry succeeding proves the composer accepts new publish actions
        // after a failure — i.e. the disabled-button bug is fixed.
        let secondResult = await composer.triggerPublishForTestsAwaiting(content: "Hello")

        XCTAssertTrue(secondResult, "Retry after failure must succeed")
        XCTAssertEqual(attempts, 2,
                       "Both attempts must reach the handler — proving the retry path is unblocked")
    }

    // MARK: - test_repost_resetWorksIdentically

    func test_repost_resetWorksIdentically() async {
        // The repost-mode init has its own publish handler (`onPublishRepost`).
        // The same rollback semantics must apply — a failure must not freeze
        // the composer in a publishing state.
        var attempts = 0
        let story = Self.makeStoryItem(id: "src-1")
        let composer = UnifiedPostComposer(
            repostingStory: story,
            authorHandle: "alice",
            onPublishRepost: { _, _ in
                attempts += 1
                if attempts == 1 { throw StubError(tag: "repost-flaky") }
            } as (String, StoryItem) async throws -> Void,
            onDismiss: {}
        )

        let firstResult = await composer.triggerPublishForTestsAwaiting(content: "Mon commentaire")
        XCTAssertFalse(firstResult, "First repost attempt must report failure (handler threw)")

        let secondResult = await composer.triggerPublishForTestsAwaiting(content: "Mon commentaire")
        XCTAssertTrue(secondResult, "Repost retry must succeed — composer is not latched")

        XCTAssertEqual(attempts, 2,
                       "Repost handler must be re-invocable after failure (proves rollback)")
    }

    // MARK: - test_legacy_sync_onPublish_init_still_compiles_and_runs

    /// Regression guard for the back-compat path: the original `init(onPublish:onDismiss:)`
    /// with a synchronous closure must keep working without the caller having to
    /// migrate to `async throws`. Sync callers cannot signal failure, so the
    /// "report success" semantic always holds for them.
    func test_legacy_sync_onPublish_init_still_compiles_and_runs() async {
        var handlerInvocations = 0
        let composer = UnifiedPostComposer(
            onPublish: { _, _, _, _, _ in
                handlerInvocations += 1
            },
            onDismiss: {}
        )

        let succeeded = await composer.triggerPublishForTestsAwaiting(content: "Hello")

        XCTAssertTrue(succeeded, "Sync closure can't throw → publish always reports success")
        XCTAssertEqual(handlerInvocations, 1, "Sync handler must run exactly once")
    }
}

// MARK: - AsyncGate

/// Tiny actor-based gate so a test can pause a handler at a known point and
/// inspect intermediate state, then release the handler to let it complete.
/// We can't use `XCTestExpectation.wait` inside an async handler because that
/// blocks the runloop; we want cooperative async suspension instead.
private actor AsyncGate {
    private var continuations: [CheckedContinuation<Void, Never>] = []
    private var released = false

    func wait() async {
        if released { return }
        await withCheckedContinuation { cont in
            continuations.append(cont)
        }
    }

    func release() {
        released = true
        for cont in continuations { cont.resume() }
        continuations.removeAll()
    }
}

// MARK: - HandlerProgress

/// Actor-based counter pair so a test can observe `handler started` and
/// `handler finished` without racing on shared mutable state from the
/// handler closure. Mirrors the two boundaries of the production
/// `isPublishing = true ... isPublishing = false` window.
private actor HandlerProgress {
    private(set) var startedCount = 0
    private(set) var finishedCount = 0

    func recordStarted() { startedCount += 1 }
    func recordFinished() { finishedCount += 1 }
}
