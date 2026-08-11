#if os(iOS)
import XCTest
import AVFoundation
import Combine
@testable import MeeshySDK

final class MediaSessionCoordinatorTests: XCTestCase {

    private var cancellables: Set<AnyCancellable>!

    override func setUp() {
        super.setUp()
        cancellables = []
    }

    override func tearDown() {
        cancellables = nil
        super.tearDown()
    }

    /// Simulate an AVAudioSession interruption began / ended cycle and make
    /// sure subscribers receive the corresponding events. This guards
    /// against future regressions where the actor swallows the system
    /// notification (e.g. dropped observer registration).
    func test_interruptionBegan_isRepublishedOnEventsSubject() async {
        let coordinator = MediaSessionCoordinator.shared
        // Trigger observer installation by requesting a session role. The
        // request itself may throw in CI environments without audio but
        // we still want the side effect of registering observers.
        _ = try? await coordinator.request(role: .playback)
        // Release immediately so we don't hold an activation count across tests.
        await coordinator.release()

        let expectation = expectation(description: "interruption began received")
        coordinator.events
            .filter { $0 == .interruptionBegan }
            .sink { _ in expectation.fulfill() }
            .store(in: &cancellables)

        NotificationCenter.default.post(
            name: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance(),
            userInfo: [
                AVAudioSessionInterruptionTypeKey: AVAudioSession.InterruptionType.began.rawValue
            ]
        )

        await fulfillment(of: [expectation], timeout: 1.0)
    }

    func test_routeChangeOldDeviceUnavailable_isRepublished() async {
        let coordinator = MediaSessionCoordinator.shared
        _ = try? await coordinator.request(role: .playback)
        await coordinator.release()

        let expectation = expectation(description: "route old device unavailable")
        coordinator.events
            .filter { $0 == .routeChangedOldDeviceUnavailable }
            .sink { _ in expectation.fulfill() }
            .store(in: &cancellables)

        class MockPort: AVAudioSessionPortDescription, @unchecked Sendable {}
        class MockRoute: AVAudioSessionRouteDescription, @unchecked Sendable {
            override var outputs: [AVAudioSessionPortDescription] {
                return [MockPort()]
            }
        }

        NotificationCenter.default.post(
            name: AVAudioSession.routeChangeNotification,
            object: AVAudioSession.sharedInstance(),
            userInfo: [
                AVAudioSessionRouteChangeReasonKey: AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue,
                AVAudioSessionRouteChangePreviousRouteKey: MockRoute()
            ]
        )

        await fulfillment(of: [expectation], timeout: 1.0)
    }

    func test_routeChangeOldDeviceUnavailable_withEmptyOutputs_isIgnored() async {
        let coordinator = MediaSessionCoordinator.shared
        _ = try? await coordinator.request(role: .playback)
        await coordinator.release()

        let expectation = expectation(description: "route other received")
        coordinator.events
            .filter { $0 == .routeChangedOther }
            .sink { _ in expectation.fulfill() }
            .store(in: &cancellables)

        class MockRouteEmpty: AVAudioSessionRouteDescription, @unchecked Sendable {
            override var outputs: [AVAudioSessionPortDescription] {
                return []
            }
        }

        NotificationCenter.default.post(
            name: AVAudioSession.routeChangeNotification,
            object: AVAudioSession.sharedInstance(),
            userInfo: [
                AVAudioSessionRouteChangeReasonKey: AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue,
                AVAudioSessionRouteChangePreviousRouteKey: MockRouteEmpty()
            ]
        )

        await fulfillment(of: [expectation], timeout: 1.0)
    }

    func test_deactivateForBackground_doesNotThrow() async {
        let coordinator = MediaSessionCoordinator.shared
        await coordinator.deactivateForBackground()
        // Calling it twice is also safe.
        await coordinator.deactivateForBackground()
    }

    /// Regression guard for the `callActive`/`events` data race fixed
    /// alongside this test: `setCallActive` (synchronous MainActor caller)
    /// racing `forward(_:)` (this actor's own serial executor, reached via a
    /// system-notification `Task` hop) previously read/wrote a bare
    /// `nonisolated(unsafe)` `Bool` and called the non-thread-safe
    /// `PassthroughSubject.send(_:)` from both contexts unsynchronized. This
    /// hammers both paths concurrently — it cannot force a specific
    /// interleaving without a sanitizer, but it does prove the lock-guarded
    /// rewrite never crashes or deadlocks under real concurrent pressure.
    func test_concurrentSetCallActiveAndNotificationForward_doesNotCrash() async {
        let coordinator = MediaSessionCoordinator.shared
        _ = try? await coordinator.request(role: .playback)
        await coordinator.release()

        await withTaskGroup(of: Void.self) { group in
            for i in 0..<50 {
                group.addTask {
                    coordinator.setCallActive(i.isMultiple(of: 2))
                    coordinator.setCallActive(false)
                }
                group.addTask {
                    NotificationCenter.default.post(
                        name: AVAudioSession.interruptionNotification,
                        object: AVAudioSession.sharedInstance(),
                        userInfo: [
                            AVAudioSessionInterruptionTypeKey: AVAudioSession.InterruptionType.began.rawValue
                        ]
                    )
                }
                group.addTask {
                    _ = coordinator.isCallActive
                }
            }
        }

        // Let any in-flight `Task { await self.forward(event) }` hops spawned
        // by the notification posts above land before the next test reuses
        // the shared singleton.
        try? await Task.sleep(nanoseconds: 50_000_000)
        coordinator.setCallActive(false)
    }
}

// MARK: - callActive / events thread-safety source guards
//
// Mirrors `CallManagerIsCallActiveFlagSourceGuardTests`
// (MeeshyTests/Unit/Services/CallManagerTests.swift) — same idiom, same
// class of bug: a `nonisolated(unsafe)` flag read from a non-writer thread
// must be lock-guarded, and a `PassthroughSubject` published from more than
// one execution context must serialize its `send(_:)` calls.
final class MediaSessionCoordinatorThreadSafetySourceGuardTests: XCTestCase {

    private func coordinatorSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshySDK/MediaSessionCoordinator.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_callActive_isNotUnsafeNonisolated() throws {
        let src = try coordinatorSource()
        XCTAssertFalse(
            src.contains("nonisolated(unsafe) private var callActive"),
            "callActive must NOT be a bare nonisolated(unsafe) Bool — it is written from the " +
            "MainActor and read from this actor's own executor, which needs a lock guard to " +
            "prevent a Swift 6 data race (same pattern as CallManager.isCallActiveFlag)."
        )
    }

    func test_callActive_usesOSAllocatedUnfairLock() throws {
        let src = try coordinatorSource()
        XCTAssertTrue(
            src.contains("_callActiveLock") && src.contains("OSAllocatedUnfairLock"),
            "callActive's backing store must use OSAllocatedUnfairLock so concurrent actor-" +
            "executor reads are serialised against @MainActor writes."
        )
    }

    func test_forward_publishesThroughEmitNotEventsSendDirectly() throws {
        let src = try coordinatorSource()
        guard let range = src.range(of: "private func forward(_ event: Event?) {") else {
            XCTFail("forward(_:) not found in MediaSessionCoordinator.swift"); return
        }
        let tail = src[range.upperBound...]
        guard let endOfBody = tail.range(of: "\n    }") else {
            XCTFail("Could not find the end of forward(_:)'s body"); return
        }
        let body = String(tail[tail.startIndex..<endOfBody.lowerBound])
        XCTAssertTrue(
            body.contains("emit(event)"),
            "forward(_:) must publish via the lock-serialized emit(_:) helper."
        )
        XCTAssertFalse(
            body.contains("events.send(event)"),
            "forward(_:) must not call events.send(_:) directly — PassthroughSubject.send is " +
            "not documented thread-safe for concurrent callers, and setCallActive publishes " +
            "from a different execution context."
        )
    }

    func test_eventsSend_isOnlyCalledFromWithinEmit() throws {
        let src = try coordinatorSource()
        let occurrences = src.components(separatedBy: "events.send(").count - 1
        XCTAssertEqual(
            occurrences, 1,
            "events.send(_:) must be called exactly once in this file, inside the lock-" +
            "serialized emit(_:) helper — every publisher (setCallActive, forward) must go " +
            "through emit(_:), never events.send(_:) directly."
        )
    }
}
#endif
