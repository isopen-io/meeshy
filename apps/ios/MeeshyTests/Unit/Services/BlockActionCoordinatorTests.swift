import XCTest
@testable import Meeshy
@testable import MeeshySDK

@MainActor
final class BlockActionCoordinatorTests: XCTestCase {

    private func makeSUT() -> (BlockActionCoordinator, MockBlockService, MockOfflineQueue) {
        let block = MockBlockService()
        let queue = MockOfflineQueue()
        let sut = BlockActionCoordinator(blockService: block, offlineQueue: queue)
        return (sut, block, queue)
    }

    func test_block_routesThroughOutbox_andFlipsCanonicalBlocklist() async {
        let (sut, block, queue) = makeSUT()

        await sut.block(userId: "u1")

        XCTAssertEqual(queue.enqueueCalls.count, 1)
        XCTAssertEqual(queue.enqueueCalls.first?.kind, .blockUser,
            "block must enqueue the durable .blockUser mutation")
        XCTAssertEqual(block.blockUserCallCount, 0,
            "must NOT hit the direct REST block path (the dispatcher owns it)")
        XCTAssertTrue(block.isBlocked(userId: "u1"),
            "block must flip the canonical blocklist optimistically")
    }

    func test_unblock_routesThroughOutbox_andClearsCanonicalBlocklist() async {
        let (sut, block, queue) = makeSUT()
        block.blockedUserIds = ["u2"]

        await sut.unblock(userId: "u2")

        XCTAssertEqual(queue.enqueueCalls.first?.kind, .unblockUser)
        XCTAssertEqual(block.unblockUserCallCount, 0)
        XCTAssertFalse(block.isBlocked(userId: "u2"))
    }

    func test_block_exhaustedOutcome_rollsBackOptimisticFlip() async {
        let (sut, block, queue) = makeSUT()

        await sut.block(userId: "u3")
        XCTAssertTrue(block.isBlocked(userId: "u3"))

        // Le coordinateur génère son propre cmid (le retour d'enqueue est
        // ignoré) — on le récupère depuis le payload enregistré pour émettre
        // l'outcome sur le BON stream.
        let cmid = (queue.enqueueCalls.first?.payload as? BlockUserPayload)?.clientMutationId
        XCTAssertNotNil(cmid)
        // Laisse le Task de l'observer enregistrer sa continuation avant l'émission.
        try? await Task.sleep(nanoseconds: 100_000_000)
        queue.emitOutcome(.exhausted(cmid: cmid!), for: cmid!)
        try? await Task.sleep(nanoseconds: 200_000_000)

        XCTAssertFalse(block.isBlocked(userId: "u3"),
            "an exhausted block must roll the canonical blocklist back to its pre-mutation value")
    }

    func test_block_enqueueFailure_rollsBackSynchronously() async {
        let (sut, block, queue) = makeSUT()
        queue.enqueueResult = .failure(NSError(domain: "test", code: 1))

        await sut.block(userId: "u4")

        XCTAssertFalse(block.isBlocked(userId: "u4"),
            "if the enqueue itself fails, the optimistic flip must roll back immediately")
    }
}
