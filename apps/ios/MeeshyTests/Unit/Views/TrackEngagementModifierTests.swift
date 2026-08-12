import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class TrackEngagementModifierTests: XCTestCase {
    func test_lifecycle_beginOnAppear_endOnDisappear() async {
        let tracker = EngagementTracker(sink: MockEngagementSink(), nowMs: { 0 },
                                        userIdProvider: { "u1" }, consentProvider: { true })
        let coordinator = TrackEngagementCoordinator(
            postId: "p1", contentType: .post, surface: .detail, tracker: tracker)
        coordinator.onAppear()
        await coordinator.onDisappear()
        // No crash + idempotent double-disappear
        await coordinator.onDisappear()
    }
}
