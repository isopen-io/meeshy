import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Tests for `StoryOfflineQueueBootstrap.publish(item:)` — the bridge that
/// forwards items dequeued from `StoryOfflineQueue` into the production
/// `StoryPublishQueue` so they actually reach the server on reconnect.
///
/// The bridge was previously a stub returning `false` unconditionally, which
/// caused queued stories to loop forever in the offline queue without ever
/// being handed off to the retry/upload pipeline (P0 bug — composed stories
/// silently lost on reconnect).
@MainActor
final class StoryOfflineQueueBootstrapPublishTests: XCTestCase {

    // MARK: - Factory

    private func makeItem(
        id: String = "queue-item-1",
        slidePayloadJSON: String = #"{"slides":[{"id":"a","duration":5}]}"#,
        mediaURLPaths: [String: String] = ["media-1": "/tmp/media-1.jpg"],
        audioURLPaths: [String: String] = ["audio-1": "/tmp/audio-1.m4a"],
        visibility: String = "PUBLIC"
    ) -> StoryOfflineQueueItem {
        StoryOfflineQueueItem(
            id: id,
            slideIds: ["slide-1"],
            slidePayloadJSON: slidePayloadJSON,
            mediaURLPaths: mediaURLPaths,
            audioURLPaths: audioURLPaths,
            originalLanguage: "fr",
            visibility: visibility
        )
    }

    // MARK: - Spy bridge

    /// Captures invocations of the bridge so we can assert what the bootstrap
    /// hands off to the downstream publish queue.
    final class SpyBridge: OfflineToPublishBridging, @unchecked Sendable {
        var enqueueCallCount = 0
        var lastEnqueuedItem: StoryPublishQueueItem?
        var stubbedResult: Bool = true

        func enqueueForPublish(_ item: StoryPublishQueueItem) async -> Bool {
            enqueueCallCount += 1
            lastEnqueuedItem = item
            return stubbedResult
        }
    }

    final class FailingBridge: OfflineToPublishBridging, @unchecked Sendable {
        func enqueueForPublish(_ item: StoryPublishQueueItem) async -> Bool {
            false
        }
    }

    // MARK: - Tests

    func test_publish_validItem_returnsTrue_whenBridgeEnqueueSucceeds() async {
        let bridge = SpyBridge()
        bridge.stubbedResult = true
        let bootstrap = StoryOfflineQueueBootstrap(bridge: bridge)

        let result = await bootstrap.publish(item: makeItem())

        XCTAssertTrue(result, "publish must return true when the downstream bridge enqueue succeeds")
    }

    func test_publish_callsDownstreamBridge_exactlyOnce() async {
        let bridge = SpyBridge()
        let bootstrap = StoryOfflineQueueBootstrap(bridge: bridge)

        _ = await bootstrap.publish(item: makeItem())

        XCTAssertEqual(bridge.enqueueCallCount, 1,
                       "publish must invoke the bridge exactly once per queued item")
    }

    func test_publish_forwardsVisibilityAndPayload() async {
        let bridge = SpyBridge()
        let bootstrap = StoryOfflineQueueBootstrap(bridge: bridge)
        let payload = #"{"slides":[{"id":"keep-me","duration":3}]}"#

        _ = await bootstrap.publish(item: makeItem(
            slidePayloadJSON: payload,
            visibility: "FRIENDS"
        ))

        let forwarded = bridge.lastEnqueuedItem
        XCTAssertNotNil(forwarded)
        XCTAssertEqual(forwarded?.visibility, "FRIENDS")
        XCTAssertEqual(
            forwarded.flatMap { String(data: $0.slidesPayload, encoding: .utf8) },
            payload,
            "Bridge must receive the slide payload bytes from the offline item"
        )
    }

    func test_publish_forwardsMediaAndAudioReferences() async {
        let bridge = SpyBridge()
        let bootstrap = StoryOfflineQueueBootstrap(bridge: bridge)

        _ = await bootstrap.publish(item: makeItem(
            mediaURLPaths: ["img-1": "/tmp/img-1.jpg", "vid-1": "/tmp/vid-1.mp4"],
            audioURLPaths: ["aud-1": "/tmp/aud-1.m4a"]
        ))

        let refs = bridge.lastEnqueuedItem?.mediaReferences ?? []
        XCTAssertEqual(refs.count, 3, "All media + audio paths must be forwarded as references")

        let byElement = Dictionary(uniqueKeysWithValues: refs.map { ($0.elementId, $0) })
        XCTAssertEqual(byElement["img-1"]?.localFilePath, "/tmp/img-1.jpg")
        XCTAssertEqual(byElement["vid-1"]?.localFilePath, "/tmp/vid-1.mp4")
        XCTAssertEqual(byElement["aud-1"]?.localFilePath, "/tmp/aud-1.m4a")
        XCTAssertEqual(byElement["aud-1"]?.mediaType, "audio",
                       "Audio entries must be tagged with mediaType=audio")
        XCTAssertEqual(byElement["img-1"]?.mediaType, "image",
                       "Media entries must default to mediaType=image")
    }

    func test_publish_invalidPayload_returnsFalse_andDoesNotCallBridge() async {
        // Empty JSON string cannot produce UTF-8 bytes for the publish queue
        // payload — the bridge MUST stay untouched so the item remains queued.
        let bridge = SpyBridge()
        let bootstrap = StoryOfflineQueueBootstrap(bridge: bridge)

        let result = await bootstrap.publish(item: makeItem(slidePayloadJSON: ""))

        XCTAssertFalse(result, "Empty payload must keep the item in the offline queue")
        XCTAssertEqual(bridge.enqueueCallCount, 0,
                       "Bridge must not be called when the payload cannot be encoded")
    }

    func test_publish_bridgeFailure_propagatesFalse() async {
        let bootstrap = StoryOfflineQueueBootstrap(bridge: FailingBridge())

        let result = await bootstrap.publish(item: makeItem())

        XCTAssertFalse(result, "Bridge failure must surface as false so the item stays queued")
    }
}
