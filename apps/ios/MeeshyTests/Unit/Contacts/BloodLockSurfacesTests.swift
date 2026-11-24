import XCTest
import MeeshySDK
@testable import Meeshy

/// Au palier Sang, tout est partagé d'office (#20359) : aucune demande ni offre de partage ne se montre quand le serveur
/// sert le verrou — absentes, jamais grisées. Sans verrou servi, le comportement d'avant tient.
@MainActor
final class BloodLockSurfacesTests: XCTestCase {

    private final class StubLocks: BloodLockProviding {
        var served: [String: RelationBloodLock] = [:]
        func lock(for userId: String) -> RelationBloodLock { served[userId.lowercased()] ?? .open }
        func refresh(_ userId: String) async -> RelationBloodLock { lock(for: userId) }
        func record(_ lock: RelationBloodLock, for userId: String) { served[userId.lowercased()] = lock }
    }

    private struct NeverRequests: SharedLocationRequesting {
        func requestSharedLocation(from userId: String, kind: SharedLocationRequestKind) async -> SharedLocationRequestOutcome { .sent }
    }

    private let full = RelationBloodLock(lockedByLevel: true, ritualSharesLocked: true)
    private let minor = RelationBloodLock(lockedByLevel: true, ritualSharesLocked: false)

    func test_canAsk_betweenLockedBloods_isFalse() {
        let locks = StubLocks()
        locks.served["bob"] = full
        let sut = SharedLocationAskCenter(requester: NeverRequests(), locks: locks)

        XCTAssertFalse(sut.canAsk("bob"))
        XCTAssertTrue(sut.positionIsSharedByDefault("bob"))
    }

    func test_canAsk_withoutServedLock_staysAsBefore() {
        let sut = SharedLocationAskCenter(requester: NeverRequests(), locks: StubLocks())

        XCTAssertTrue(sut.canAsk("bob"))
        XCTAssertFalse(sut.positionIsSharedByDefault("bob"))
    }

    func test_canAsk_forADeclaredMinor_staysAvailable() {
        let locks = StubLocks()
        locks.served["bob"] = minor
        let sut = SharedLocationAskCenter(requester: NeverRequests(), locks: locks)

        XCTAssertTrue(sut.canAsk("bob"))
    }

    private func profile(locks: BloodLockProviding) async -> ProfileCircleViewModel {
        let relations = MockRelationsService()
        relations.linksResult = .success([RelationLink(userId: "a", effectiveLevel: .blood, grantedByMe: .blood)])
        let sut = ProfileCircleViewModel(userId: "a", relations: relations, friendService: MockFriendService(),
                                         offlineQueue: MockOfflineQueue(), networkMonitor: FakeNetworkMonitor(isOnline: true),
                                         forgetFriendship: { _ in }, locks: locks)
        await sut.load()
        return sut
    }

    func test_offersSharedLocation_atALockedBlood_isFalse() async {
        await CacheCoordinator.shared.relationLinks.invalidate(for: CirclesViewModel.cacheKey)
        let locks = StubLocks()
        locks.served["a"] = full

        let sut = await profile(locks: locks)

        XCTAssertFalse(sut.offersSharedLocation)
    }

    func test_offersSharedLocation_atABloodWithoutServedLock_staysOffered() async {
        await CacheCoordinator.shared.relationLinks.invalidate(for: CirclesViewModel.cacheKey)

        let sut = await profile(locks: StubLocks())

        XCTAssertTrue(sut.offersSharedLocation)
    }

    func test_offersSharedLocation_forADeclaredMinor_staysOffered() async {
        await CacheCoordinator.shared.relationLinks.invalidate(for: CirclesViewModel.cacheKey)
        let locks = StubLocks()
        locks.served["a"] = minor

        let sut = await profile(locks: locks)

        XCTAssertTrue(sut.offersSharedLocation)
    }

    func test_reception_blockedByTheLock_rollsBackWithoutARawError() async {
        let service = MockBringService()
        service.settingsResult = .success(RelationPersonSettings(userId: "bob", bringBlocked: false))
        service.setBlockedResult = .failure(MeeshyError.rejected(
            APIRejection(statusCode: 409, code: "RELATION_BLOOD_LOCKED", message: "Entre Sangs, rien ne se coupe")))
        let locks = StubLocks()
        let sut = CircleReceptionBlockViewModel(userId: "bob", personSwitch: .reception(.bring), service: service, locks: locks)
        await sut.load()

        let saved = await sut.setOn(true)

        XCTAssertFalse(saved)
        XCTAssertFalse(sut.isOn)
        XCTAssertEqual(sut.notice, BloodLockWording.lockedNotice)
        XCTAssertTrue(locks.lock(for: "bob").isLocked)
    }

    func test_load_recordsTheServedLock() async {
        let service = MockBringService()
        service.settingsResult = .success(RelationPersonSettings(userId: "bob", bringBlocked: false, bloodLock: full))
        let locks = StubLocks()
        let sut = CircleReceptionBlockViewModel(userId: "bob", personSwitch: .reception(.bring), service: service, locks: locks)

        await sut.load()

        XCTAssertEqual(locks.lock(for: "bob"), full)
    }
}
