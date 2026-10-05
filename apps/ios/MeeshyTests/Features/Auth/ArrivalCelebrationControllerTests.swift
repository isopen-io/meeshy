import XCTest
@testable import Meeshy

/// Un verrou que le témoin ouvre quand il le décide : la célébration et le
/// préchargement ne finissent qu'à son signal, jamais à l'horloge.
@MainActor
final class ArrivalTestLatch {
    nonisolated deinit {}
    private var waiters: [CheckedContinuation<Void, Never>] = []
    private var isOpen = false

    func wait() async {
        guard !isOpen else { return }
        await withCheckedContinuation { waiters.append($0) }
    }

    func open() {
        isOpen = true
        let pending = waiters
        waiters = []
        pending.forEach { $0.resume() }
    }
}

@MainActor
final class MockArrivalPrefetcher: ArrivalPrefetching {
    nonisolated deinit {}
    let latch = ArrivalTestLatch()
    private(set) var startCount = 0
    private(set) var finishCount = 0

    func prefetch() async {
        startCount += 1
        await latch.wait()
        finishCount += 1
    }
}

@MainActor
final class MockArrivalCelebration: ArrivalCelebrating {
    nonisolated deinit {}
    private(set) var celebratedUserIds: [String] = []

    func begin(userId: String) {
        celebratedUserIds.append(userId)
    }
}

/// #8089 — la session qui s'ouvre sur la preuve de l'adresse est CÉLÉBRÉE juste
/// avant l'onboarding. La célébration LANCE le préchargement, qui lui survit :
/// l'onboarding qui lui succède ne l'annule pas.
@MainActor
final class ArrivalCelebrationControllerTests: XCTestCase {

    private func makeSUT() -> (sut: ArrivalCelebrationController, prefetcher: MockArrivalPrefetcher, hold: ArrivalTestLatch) {
        let prefetcher = MockArrivalPrefetcher()
        let hold = ArrivalTestLatch()
        let sut = ArrivalCelebrationController(prefetcher: prefetcher, hold: { await hold.wait() })
        return (sut, prefetcher, hold)
    }

    func test_begin_showsTheCelebrationAndStartsThePrefetchAtOnce() async {
        let (sut, prefetcher, _) = makeSUT()

        sut.begin(userId: "u1")
        await Task.yield()

        XCTAssertTrue(sut.isShowing)
        XCTAssertEqual(prefetcher.startCount, 1, "le préchargement part AU DÉBUT de la célébration")
    }

    func test_holdEnded_hidesTheCelebration_whileThePrefetchKeepsRunning() async {
        let (sut, prefetcher, hold) = makeSUT()
        sut.begin(userId: "u1")

        hold.open()
        await sut.awaitHold()

        XCTAssertFalse(sut.isShowing)
        XCTAssertEqual(prefetcher.finishCount, 0, "le préchargement continue pendant l'onboarding")

        prefetcher.latch.open()
        await sut.awaitPrefetch()

        XCTAssertEqual(prefetcher.finishCount, 1, "l'onboarding qui succède n'a pas annulé le préchargement")
    }

    func test_dismiss_hidesTheCelebration_withoutCancellingThePrefetch() async {
        let (sut, prefetcher, _) = makeSUT()
        sut.begin(userId: "u1")
        await Task.yield()

        sut.dismiss()
        prefetcher.latch.open()
        await sut.awaitPrefetch()

        XCTAssertFalse(sut.isShowing)
        XCTAssertEqual(prefetcher.finishCount, 1)
    }

    func test_beginAgain_sameUser_neverPrefetchesTwice() async {
        let (sut, prefetcher, hold) = makeSUT()
        sut.begin(userId: "u1")
        await Task.yield()
        hold.open()
        await sut.awaitHold()

        sut.begin(userId: "u1")
        await Task.yield()

        XCTAssertEqual(prefetcher.startCount, 1)
    }

    func test_beginAgain_whileShowing_keepsASingleCelebration() async {
        let (sut, _, hold) = makeSUT()
        sut.begin(userId: "u1")
        sut.begin(userId: "u1")

        hold.open()
        await sut.awaitHold()

        XCTAssertFalse(sut.isShowing)
    }

    func test_begin_anotherUser_prefetchesForThatUser() async {
        let (sut, prefetcher, hold) = makeSUT()
        sut.begin(userId: "u1")
        hold.open()
        await sut.awaitHold()

        sut.begin(userId: "u2")
        await Task.yield()

        XCTAssertEqual(prefetcher.startCount, 2)
    }
}

/// Reduce Motion : aucune particule, un fondu sobre.
final class ArrivalCelebrationMotionTests: XCTestCase {

    func test_fullMotion_playsTheFireworks() {
        XCTAssertEqual(ArrivalCelebrationMotion(reduceMotion: false), .fireworks)
    }

    func test_reduceMotion_fadesWithoutParticles() {
        let motion = ArrivalCelebrationMotion(reduceMotion: true)

        XCTAssertEqual(motion, .fade)
        XCTAssertFalse(motion.showsParticles)
    }

    func test_fireworks_particlesStayInsideTheirLifetime() {
        let sparks = ArrivalFireworks.sparks(at: 0.9, burstCount: 4, sparksPerBurst: 10)

        XCTAssertFalse(sparks.isEmpty)
        XCTAssertTrue(sparks.allSatisfy { (0...1).contains($0.opacity) })
    }

    func test_fireworks_afterTheShow_drawNothing() {
        XCTAssertTrue(ArrivalFireworks.sparks(at: ArrivalFireworks.showDuration + 1, burstCount: 4, sparksPerBurst: 10).isEmpty)
    }
}
