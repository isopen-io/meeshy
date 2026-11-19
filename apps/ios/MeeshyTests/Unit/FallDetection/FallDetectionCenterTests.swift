import Combine
import XCTest
import MeeshySDK
@testable import Meeshy

/// La chute détectée sur iOS (#18748), les deux rôles : le LECTEUR tient l'état servi, l'efface à `fall:cleared` ou à la
/// levée poussée, fait passer l'annonce dans la SyncPill et ne garde jamais la position au repos ; l'ÉMETTEUR n'observe
/// qu'avec son accord, ne rapporte que les échantillons neufs et récents, et coupe l'observateur sur un refus.
@MainActor
final class FallDetectionCenterTests: XCTestCase {

    private let clock = Date(timeIntervalSince1970: 1_800_000_000)

    @MainActor
    private final class Session {
        var viewer: String?
        init(viewer: String?) { self.viewer = viewer }
    }

    private final class MemoryCacheOwner: FallCacheOwnerStoring {
        var owner: String?
        init(_ owner: String?) { self.owner = owner }
    }

    private struct Rig {
        let sut: FallDetectionCenter
        let store: FallStateStore
        let persistence: MemoryFallStatePersistence
        let feed: FallAnnouncementFeed
        let service: MockFallDetectionService
        let source: FakeFallSampleSource
        let session: Session
    }

    private func makeSUT(viewer: String? = "me", names: [String: String] = ["peer": "Awa"], cacheOwner: String? = "me") -> Rig {
        let clock = self.clock
        let persistence = MemoryFallStatePersistence()
        let store = FallStateStore(persistence: persistence, now: { clock })
        let feed = FallAnnouncementFeed(now: { clock })
        let service = MockFallDetectionService()
        let source = FakeFallSampleSource()
        let session = Session(viewer: viewer)
        let sut = FallDetectionCenter(
            store: store, feed: feed, service: service, source: source,
            viewerId: { session.viewer },
            displayName: { names[$0] },
            now: { clock },
            detectedEvents: Empty().eraseToAnyPublisher(),
            clearedEvents: Empty().eraseToAnyPublisher(),
            connected: Empty().eraseToAnyPublisher(),
            cacheOwner: MemoryCacheOwner(cacheOwner)
        )
        return Rig(sut: sut, store: store, persistence: persistence, feed: feed, service: service, source: source, session: session)
    }

    private func state(_ userId: String = "peer", position: InactivityLastPosition? = nil) -> FallState {
        FallState(userId: userId, detectedAt: clock.addingTimeInterval(-120), expiresAt: clock.addingTimeInterval(FallDetectionContract.episodeTtl),
                  lastPosition: position, lastBattery: InactivityLastBattery(level: 41, measuredAt: clock))
    }

    private func detected(_ userId: String = "peer", announced: Bool, position: InactivityLastPosition? = nil) -> FallDetected {
        FallDetected(userId: userId, state: state(userId, position: position), announcedAt: announced ? clock : nil)
    }

    private let consented = FallConsentSettings(consentedAt: Date(timeIntervalSince1970: 1_799_000_000), consentVersion: "2026-11-19", currentVersion: "2026-11-19")

    // MARK: - Le lecteur

    func test_receiveDetected_withAnnouncement_holdsTheState_andSaysItInTheSyncPill() async {
        let rig = makeSUT()
        await rig.sut.receive(detected(announced: true))
        XCTAssertEqual(rig.store.state(for: "peer")?.lastBattery?.level, 41)
        XCTAssertEqual(rig.feed.current.first?.label, FallDetectionWording.pillLabel(kind: .detected, name: "Awa"))
        XCTAssertEqual(rig.feed.entries.first?.id, "fall.peer")
    }

    func test_receiveDetected_withoutAnnouncement_isSilent() async {
        let rig = makeSUT()
        await rig.sut.receive(detected(announced: false))
        XCTAssertNotNil(rig.store.state(for: "peer"))
        XCTAssertTrue(rig.feed.current.isEmpty)
    }

    func test_thePositionStaysInMemory_andIsNeverWrittenToDisk() async {
        let rig = makeSUT()
        let position = InactivityLastPosition(latitude: 48.85, longitude: 2.35, accuracy: 20, recordedAt: clock)
        await rig.sut.receive(detected(announced: false, position: position))
        XCTAssertEqual(rig.store.state(for: "peer")?.lastPosition, position)
        XCTAssertEqual(rig.persistence.saved.map(\.lastPosition), [nil])
    }

    func test_receiveCleared_responded_removesTheState_andSaysTheyAreOk() async {
        let rig = makeSUT()
        await rig.sut.receive(detected(announced: false))
        await rig.sut.receive(FallCleared(userId: "peer", reason: .responded))
        XCTAssertNil(rig.store.state(for: "peer"))
        XCTAssertEqual(rig.feed.current.first?.kind, .responded)
    }

    func test_receiveCleared_expiredOrWithdrawn_removesTheState_silently() async {
        let rig = makeSUT()
        await rig.sut.receive(detected(announced: false))
        await rig.sut.receive(FallCleared(userId: "peer", reason: .withdrawn))
        XCTAssertNil(rig.store.state(for: "peer"))
        XCTAssertTrue(rig.feed.current.isEmpty)
    }

    func test_aPushedClearing_removesTheStateLikeFallCleared() async {
        let rig = makeSUT()
        await rig.sut.receive(detected(announced: false))
        rig.sut.receivePushedClearing(userId: "peer")
        XCTAssertNil(rig.store.state(for: "peer"))
    }

    func test_myOwnFallIsNeverShownAsASang() async {
        let rig = makeSUT()
        await rig.sut.receive(detected("me", announced: true))
        XCTAssertNil(rig.store.state(for: "me"))
        XCTAssertTrue(rig.feed.current.isEmpty)
    }

    func test_catchUp_theSnapshotIsAuthoritative_withoutMe() async {
        let rig = makeSUT()
        await rig.sut.receive(detected("stale", announced: false))
        rig.service.snapshotResult = .success([state("peer"), state("me")])
        await rig.sut.catchUp()
        XCTAssertEqual(rig.store.states.keys.sorted(), ["peer"])
    }

    func test_accountChange_toAnotherAccount_forgetsTheStates_andStopsObserving() async {
        let rig = makeSUT()
        rig.sut.accountChanged(to: "me")
        await rig.sut.receive(detected(announced: false))
        rig.session.viewer = "other"
        rig.sut.accountChanged(to: "other")
        XCTAssertTrue(rig.store.states.isEmpty)
        XCTAssertGreaterThan(rig.source.stopCount, 0)
    }

    // MARK: - L'émetteur

    func test_resume_withoutConsent_neverStartsTheObserver() async {
        let rig = makeSUT()
        await rig.sut.resumeIfConsented()
        XCTAssertTrue(rig.source.startedAccounts.isEmpty)
        XCTAssertFalse(rig.sut.isObserving)
    }

    func test_resume_withConsentOnTheCurrentText_observesForThisAccount_withoutAskingHealthAgain() async {
        let rig = makeSUT()
        rig.service.consentSettingsResult = .success(consented)
        await rig.sut.resumeIfConsented()
        XCTAssertEqual(rig.source.startedAccounts, ["me"])
        XCTAssertEqual(rig.source.authorizationRequests, 0)
    }

    func test_resume_withConsentOnAnOldText_doesNotObserve() async {
        let rig = makeSUT()
        rig.service.consentSettingsResult = .success(FallConsentSettings(consentedAt: clock, consentVersion: "2026-01-01", currentVersion: "2026-11-19"))
        await rig.sut.resumeIfConsented()
        XCTAssertTrue(rig.source.startedAccounts.isEmpty)
    }

    func test_enableAfterConsent_asksHealthFirst_andARefusalStartsNothing() async {
        let rig = makeSUT()
        rig.source.authorizationGranted = false
        let enabled = await rig.sut.enableAfterConsent()
        XCTAssertFalse(enabled)
        XCTAssertEqual(rig.source.authorizationRequests, 1)
        XCTAssertTrue(rig.source.startedAccounts.isEmpty)
    }

    func test_newRecentSamplesAreReported_oldestFirst_andOpenMyBanner() async {
        let rig = makeSUT()
        _ = await rig.sut.enableAfterConsent()
        let advanced = await rig.source.emit([clock.addingTimeInterval(-60), clock.addingTimeInterval(-3_600), clock.addingTimeInterval(-300)])
        XCTAssertTrue(advanced)
        XCTAssertEqual(rig.service.reportCalls, [clock.addingTimeInterval(-300), clock.addingTimeInterval(-60)])
        XCTAssertTrue(rig.sut.ownEpisodeOpen)
    }

    func test_anOfflineReport_keepsTheAnchor_forTheNextWake() async {
        let rig = makeSUT()
        _ = await rig.sut.enableAfterConsent()
        rig.service.reportResults = [.failed]
        let advanced = await rig.source.emit([clock.addingTimeInterval(-60)])
        XCTAssertFalse(advanced)
        XCTAssertFalse(rig.sut.ownEpisodeOpen)
    }

    func test_aRefusalWithoutConsent_stopsTheObserver() async {
        let rig = makeSUT()
        _ = await rig.sut.enableAfterConsent()
        rig.service.reportResults = [.consentRequired]
        _ = await rig.source.emit([clock.addingTimeInterval(-60)])
        XCTAssertFalse(rig.source.isObserving)
        XCTAssertFalse(rig.sut.isObserving)
    }

    func test_imOk_closesMyEpisode() async {
        let rig = makeSUT()
        _ = await rig.sut.enableAfterConsent()
        _ = await rig.source.emit([clock.addingTimeInterval(-60)])
        XCTAssertTrue(rig.sut.ownEpisodeOpen)
        await rig.sut.answerOk()
        XCTAssertEqual(rig.service.answerOkCount, 1)
        XCTAssertFalse(rig.sut.ownEpisodeOpen)
    }
}
