import XCTest
@testable import MeeshySDK

/// S3.2 — le payload d'un item DÉJÀ persisté peut être mis à niveau en aval.
/// Le write-ahead part immédiatement avec les slides brutes (durabilité) ;
/// l'enrichissement thumbHash le rattrape sans toucher à l'identité de l'item.
final class StoryPublishQueuePayloadUpdateTests: XCTestCase {

    private var queue: StoryPublishQueue!

    override func setUp() async throws {
        try await super.setUp()
        queue = StoryPublishQueue.shared
        await queue._testResetPublishHandler()
        await queue.clearAll()
    }

    override func tearDown() async throws {
        await queue._testResetPublishHandler()
        await queue.clearAll()
        try await super.tearDown()
    }

    func test_updateSlidesPayload_replacesPayloadPreservingItemIdentity() async {
        let item = StoryPublishQueueItem(
            visibility: "FRIENDS",
            slidesPayload: Data("[raw]".utf8),
            mediaReferences: [StoryMediaReference(elementId: "e1", mediaType: "image", localFilePath: "/tmp/e1.jpg")],
            tempStoryId: "pending_identity"
        )
        await queue.enqueue(item)

        await queue.updateSlidesPayload(item.id, Data("[enriched]".utf8))

        let stored = await queue.pendingItems.first
        XCTAssertEqual(stored?.slidesPayload, Data("[enriched]".utf8))
        XCTAssertEqual(stored?.id, item.id)
        XCTAssertEqual(stored?.tempStoryId, "pending_identity")
        XCTAssertEqual(stored?.createdAt, item.createdAt)
        XCTAssertEqual(stored?.retryCount, 0)
        XCTAssertEqual(stored?.mediaReferences.count, 1)
        XCTAssertEqual(stored?.mediaReferences.first?.elementId, "e1")
    }

    func test_updateSlidesPayload_unknownId_isNoOp() async {
        let item = StoryPublishQueueItem(visibility: "FRIENDS", slidesPayload: Data("[raw]".utf8))
        await queue.enqueue(item)

        await queue.updateSlidesPayload("item-already-drained", Data("[enriched]".utf8))

        let stored = await queue.pendingItems.first
        XCTAssertEqual(stored?.slidesPayload, Data("[raw]".utf8))
    }

    func test_updateSlidesPayload_persistsToDiskImmediately() async throws {
        let item = StoryPublishQueueItem(visibility: "FRIENDS", slidesPayload: Data("[raw]".utf8))
        await queue.enqueue(item)

        await queue.updateSlidesPayload(item.id, Data("[enriched]".utf8))

        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let file = documents
            .appendingPathComponent("meeshy_cache", isDirectory: true)
            .appendingPathComponent("story_publish_queue.json")
        let data = try Data(contentsOf: file)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let onDisk = try decoder.decode([StoryPublishQueueItem].self, from: data)

        XCTAssertEqual(onDisk.first(where: { $0.id == item.id })?.slidesPayload,
                       Data("[enriched]".utf8),
                       "Le payload enrichi doit survivre à un rechargement")
    }
}
