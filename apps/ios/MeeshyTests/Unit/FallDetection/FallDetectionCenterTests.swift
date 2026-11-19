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

    /// Ce qui se passe PENDANT la résolution d'un nom (hors du fil principal) — un changement de compte, par exemple.
    @MainActor
    private final class NameHook {
        var action: (() -> Void)?
        func fire() {
            let pending = action
            action = nil
            pending?()
        }
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
        let connected: PassthroughSubject<Bool, Never>
        let nameHook: NameHook
    }

    private func makeSUT(viewer: String? = "me", names: [String: String] = ["peer": "Awa"], cacheOwner: String? = "me") -> Rig {
        let clock = self.clock
        let persistence = MemoryFallStatePersistence()
        let store = FallStateStore(persistence: persistence, now: { clock }, sleep: { _ in })
        let feed = FallAnnouncementFeed(now: { clock })
        let service = MockFallDetectionService()
        let source = FakeFallSampleSource()
        let session = Session(viewer: viewer)
        let connected = PassthroughSubject<Bool, Never>()
        let nameHook = NameHook()
        let sut = FallDetectionCenter(
            store: store, feed: feed, service: service, source: source,
            viewerId: { session.viewer },
            displayName: { [nameHook] userId in
                await nameHook.fire()
                return names[userId]
            },
            now: { clock },
            detectedEvents: Empty().eraseToAnyPublisher(),
            clearedEvents: Empty().eraseToAnyPublisher(),
            connected: connected.eraseToAnyPublisher(),
            cacheOwner: MemoryCacheOwner(cacheOwner)
        )
        return Rig(sut: sut, store: store, persistence: persistence, feed: feed, service: service, source: source, session: session,
                   connected: connected, nameHook: nameHook)
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

    func test_anAnnouncementWhoseNameArrivesUnderAnotherAccount_isDropped() async {
        let rig = makeSUT()
        rig.sut.accountChanged(to: "me")
        rig.nameHook.action = {
            rig.session.viewer = "other"
            rig.sut.accountChanged(to: "other")
        }
        await rig.sut.receive(detected(announced: true))
        XCTAssertTrue(rig.feed.current.isEmpty)
    }

    func test_accountChange_theFirstAccountOfTheLaunch_stopsNothingBeforeReadingItsConsent() async {
        let rig = makeSUT()
        rig.service.consentSettingsResult = .failure(URLError(.notConnectedToInternet))
        rig.sut.accountChanged(to: "me")
        await rig.sut.settle()
        XCTAssertEqual(rig.source.stopCount, 0)
    }

    func test_accountChange_aLogoutStopsTheObserver() async {
        let rig = makeSUT()
        rig.service.consentSettingsResult = .success(consented)
        rig.sut.accountChanged(to: "me")
        await rig.sut.settle()
        XCTAssertTrue(rig.sut.isObserving)
        rig.session.viewer = nil
        rig.sut.accountChanged(to: nil)
        XCTAssertFalse(rig.sut.isObserving)
        XCTAssertFalse(rig.source.isObserving)
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

    func test_resume_aTransportError_keepsTheObserver() async {
        let rig = makeSUT()
        rig.service.consentSettingsResult = .success(consented)
        await rig.sut.resumeIfConsented()
        rig.service.consentSettingsResult = .failure(URLError(.notConnectedToInternet))
        await rig.sut.resumeIfConsented()
        XCTAssertTrue(rig.sut.isObserving)
        XCTAssertEqual(rig.source.stopCount, 0)
    }

    func test_resume_anExplicitRefusal_stopsTheObserver() async {
        let rig = makeSUT()
        rig.service.consentSettingsResult = .success(consented)
        await rig.sut.resumeIfConsented()
        rig.service.consentSettingsResult = .failure(MeeshyError.forbidden(reason: nil, body: nil))
        await rig.sut.resumeIfConsented()
        XCTAssertFalse(rig.sut.isObserving)
        XCTAssertFalse(rig.source.isObserving)
    }

    func test_resume_consentedButHealthNotAuthorizedHere_isBlocked_andSaysIt() async {
        let rig = makeSUT()
        rig.service.consentSettingsResult = .success(consented)
        rig.source.authorizationIsReady = false
        await rig.sut.resumeIfConsented()
        XCTAssertFalse(rig.sut.isObserving)
        XCTAssertTrue(rig.sut.isDetectionBlocked)
        XCTAssertTrue(rig.source.startedAccounts.isEmpty)
    }

    func test_reconnection_rechecksTheConsent_afterAnOfflineLaunch() async {
        let rig = makeSUT()
        rig.service.consentSettingsResult = .failure(URLError(.notConnectedToInternet))
        rig.sut.accountChanged(to: "me")
        await rig.sut.settle()
        XCTAssertFalse(rig.sut.isObserving)
        rig.service.consentSettingsResult = .success(consented)
        rig.connected.send(true)
        await rig.sut.settle()
        XCTAssertTrue(rig.sut.isObserving)
        XCTAssertEqual(rig.source.startedAccounts, ["me"])
    }

    func test_resume_whileAlreadyObservingTheSameAccount_doesNotRestartTheSource() async {
        let rig = makeSUT()
        rig.service.consentSettingsResult = .success(consented)
        await rig.sut.resumeIfConsented()
        await rig.sut.resumeIfConsented()
        XCTAssertEqual(rig.source.startedAccounts, ["me"])
    }

    func test_resume_withConsentOnAnOldText_doesNotObserve() async {
        let rig = makeSUT()
        rig.service.consentSettingsResult = .success(FallConsentSettings(consentedAt: clock, consentVersion: "2026-01-01", currentVersion: "2026-11-19"))
        await rig.sut.resumeIfConsented()
        XCTAssertTrue(rig.source.startedAccounts.isEmpty)
    }

    func test_enableAfterConsent_asksHealthFirst_andARefusalStartsNothing_butIsSaid() async {
        let rig = makeSUT()
        rig.source.authorizationGranted = false
        let enabled = await rig.sut.enableAfterConsent()
        XCTAssertFalse(enabled)
        XCTAssertEqual(rig.source.authorizationRequests, 1)
        XCTAssertTrue(rig.source.startedAccounts.isEmpty)
        XCTAssertTrue(rig.sut.isDetectionBlocked)
        rig.sut.stopObserving()
        XCTAssertFalse(rig.sut.isDetectionBlocked)
    }

    func test_aDeliveryOpenedForAPreviousAccount_reportsNothing_andKeepsItsAnchor() async {
        let rig = makeSUT()
        rig.sut.accountChanged(to: "me")
        await rig.sut.settle()
        _ = await rig.sut.enableAfterConsent()
        rig.session.viewer = "other"
        rig.sut.accountChanged(to: "other")
        let advanced = await rig.source.emitInFlight([clock.addingTimeInterval(-60)])
        XCTAssertFalse(advanced)
        XCTAssertTrue(rig.service.reportCalls.isEmpty)
    }

    func test_aDeliveryWhileAnotherViewerIsSignedIn_reportsNothing() async {
        let rig = makeSUT()
        _ = await rig.sut.enableAfterConsent()
        rig.session.viewer = "other"
        let advanced = await rig.source.emit([clock.addingTimeInterval(-60)])
        XCTAssertFalse(advanced)
        XCTAssertTrue(rig.service.reportCalls.isEmpty)
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
        let answered = await rig.sut.answerOk()
        XCTAssertTrue(answered)
        XCTAssertEqual(rig.service.answerOkCount, 1)
        XCTAssertFalse(rig.sut.ownEpisodeOpen)
    }

    func test_imOk_aFailureKeepsTheBanner_forARetry() async {
        let rig = makeSUT()
        _ = await rig.sut.enableAfterConsent()
        _ = await rig.source.emit([clock.addingTimeInterval(-60)])
        rig.service.answerOkResult = .failure(URLError(.notConnectedToInternet))
        let answered = await rig.sut.answerOk()
        XCTAssertFalse(answered)
        XCTAssertTrue(rig.sut.ownEpisodeOpen)
    }

    func test_theOwnBannerFallsAtTheEndOfTheEpisode() {
        XCTAssertNil(OwnFallEpisode.expiry(of: nil))
        XCTAssertEqual(OwnFallEpisode.expiry(of: clock), clock.addingTimeInterval(FallDetectionContract.episodeTtl))
    }
}
