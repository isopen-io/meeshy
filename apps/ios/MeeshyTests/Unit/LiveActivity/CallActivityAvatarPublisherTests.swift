import XCTest
import UIKit
@testable import Meeshy

@MainActor
private final class MockCallActivityAvatarSource: CallActivityAvatarSourcing {
    private(set) var requestedUserIds: [String] = []
    private let stub: Data?
    private var isGated: Bool
    private var gate: CheckedContinuation<Void, Never>?

    init(stub: Data?, gated: Bool = false) {
        self.stub = stub
        self.isGated = gated
    }

    nonisolated deinit {}

    func avatarImageData(forUserId userId: String) async -> Data? {
        requestedUserIds.append(userId)
        if isGated { await withCheckedContinuation { gate = $0 } }
        return stub
    }

    func open() {
        isGated = false
        gate?.resume()
        gate = nil
    }
}

@MainActor
private final class PublishCounter {
    private(set) var count = 0
    func increment() { count += 1 }
}

@MainActor
final class CallActivityAvatarPublisherTests: XCTestCase {

    private func makePNG() throws -> Data {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 300, height: 300))
        return try XCTUnwrap(renderer.image { context in
            UIColor.systemTeal.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 300, height: 300))
        }.pngData())
    }

    private func makeStore() -> LiveActivityAvatarStore {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("CallActivityAvatarPublisherTests-\(UUID().uuidString)", isDirectory: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: directory) }
        return LiveActivityAvatarStore(directory: directory)
    }

    func test_publish_writesTheThumbnailUnderTheActivity_andRefreshesOnce() async throws {
        let store = makeStore()
        let source = MockCallActivityAvatarSource(stub: try makePNG())
        let publisher = CallActivityAvatarPublisher(source: source, store: store)
        let counter = PublishCounter()

        await publisher.publish(activityID: "A", remoteUserId: "U", onPublished: { counter.increment() }).value

        XCTAssertNotNil(store.thumbnail(forActivityID: "A"))
        XCTAssertEqual(counter.count, 1)
    }

    func test_publish_withoutAvatar_writesNothing_andDoesNotRefresh() async throws {
        let store = makeStore()
        let publisher = CallActivityAvatarPublisher(source: MockCallActivityAvatarSource(stub: nil), store: store)
        let counter = PublishCounter()

        await publisher.publish(activityID: "A", remoteUserId: "U", onPublished: { counter.increment() }).value

        XCTAssertNil(store.thumbnail(forActivityID: "A"))
        XCTAssertEqual(counter.count, 0)
    }

    func test_withdrawBeforeTheSourceAnswers_leavesNoFile() async throws {
        let store = makeStore()
        let source = MockCallActivityAvatarSource(stub: try makePNG(), gated: true)
        let publisher = CallActivityAvatarPublisher(source: source, store: store)
        let counter = PublishCounter()

        let task = publisher.publish(activityID: "A", remoteUserId: "U", onPublished: { counter.increment() })
        publisher.withdraw(activityID: "A")
        source.open()
        await task.value

        XCTAssertNil(store.thumbnail(forActivityID: "A"))
        XCTAssertEqual(counter.count, 0)
    }

    func test_publishTwiceForTheSameActivity_fetchesOnce() async throws {
        let source = MockCallActivityAvatarSource(stub: try makePNG())
        let publisher = CallActivityAvatarPublisher(source: source, store: makeStore())

        await publisher.publish(activityID: "A", remoteUserId: "U", onPublished: {}).value
        await publisher.publish(activityID: "A", remoteUserId: "U", onPublished: {}).value

        let requested = source.requestedUserIds
        XCTAssertEqual(requested, ["U"])
    }

    func test_sweep_removesTheThumbnailsOfActivitiesThatAreNoLongerRunning() async throws {
        let store = makeStore()
        let source = MockCallActivityAvatarSource(stub: try makePNG())
        let publisher = CallActivityAvatarPublisher(source: source, store: store)
        await publisher.publish(activityID: "A", remoteUserId: "U", onPublished: {}).value

        publisher.sweep(keeping: [])

        XCTAssertNil(store.thumbnail(forActivityID: "A"))
    }
}
