import XCTest
import MeeshySDK
@testable import Meeshy

/// La batterie sur une fiche (#14147) : à Proche, l'offre de partage n'arrive qu'une fois et sa case n'est jamais
/// cochée d'avance ; entre Sangs, le partage est déjà actif ; la demande de relevé lit les refus de la passerelle.
@MainActor
final class ProfileBatteryViewModelTests: XCTestCase {

    private func makeSUT(shared: Bool = false) -> (ProfileBatteryViewModel, MockBatteryService, MemoryBatteryConsent) {
        let service = MockBatteryService()
        service.personSettingsResult = .success(BatteryPersonSettings(userId: "peer", isShared: shared, receive: .all))
        let consent = MemoryBatteryConsent()
        let sut = ProfileBatteryViewModel(userId: "peer", service: service, consent: consent, viewerId: { "me" })
        return (sut, service, consent)
    }

    func test_load_atClose_notShared_offersConsentOnce_unchecked() async {
        let (sut, _, _) = makeSUT()
        await sut.load(asksConsent: true)
        XCTAssertTrue(sut.showsConsentOffer)
        XCTAssertFalse(sut.consentChecked)
    }

    func test_load_betweenBloods_neverAsks() async {
        let (sut, _, _) = makeSUT()
        await sut.load(asksConsent: false)
        XCTAssertFalse(sut.showsConsentOffer)
    }

    func test_load_alreadyShared_neverAsks() async {
        let (sut, _, _) = makeSUT(shared: true)
        await sut.load(asksConsent: true)
        XCTAssertFalse(sut.showsConsentOffer)
    }

    func test_answerConsent_unchecked_sharesNothing_andNeverAsksAgain() async {
        let (sut, service, consent) = makeSUT()
        await sut.load(asksConsent: true)
        await sut.answerConsent()
        XCTAssertTrue(service.updatePersonSettingsCalls.isEmpty)
        XCTAssertFalse(sut.showsConsentOffer)

        let again = ProfileBatteryViewModel(userId: "peer", service: service, consent: consent, viewerId: { "me" })
        await again.load(asksConsent: true)
        XCTAssertFalse(again.showsConsentOffer)
    }

    func test_answerConsent_checked_sharesWithThePerson() async {
        let (sut, service, _) = makeSUT()
        await sut.load(asksConsent: true)
        sut.consentChecked = true
        await sut.answerConsent()
        XCTAssertEqual(service.updatePersonSettingsCalls.first?.isShared, true)
        XCTAssertEqual(sut.settings?.isShared, true)
    }

    func test_setShared_failure_restoresThePreviousValue() async {
        let (sut, service, _) = makeSUT(shared: true)
        await sut.load(asksConsent: false)
        service.updatePersonSettingsResult = .failure(URLError(.notConnectedToInternet))
        await sut.setShared(false)
        XCTAssertEqual(sut.settings?.isShared, true)
        XCTAssertNotNil(sut.notice)
    }

    func test_requestReading_outcomes() async {
        let (sut, service, _) = makeSUT()
        await sut.requestReading()
        XCTAssertEqual(sut.pullState, .requested)

        let (forbidden, forbiddenService, _) = makeSUT()
        forbiddenService.pullResult = .forbidden
        await forbidden.requestReading()
        XCTAssertEqual(forbidden.pullState, .idle)
        XCTAssertNotNil(forbidden.notice)
        XCTAssertEqual(service.pullCallCount, 1)
    }
}

/// Ce que je reçois de la batterie d'une personne : posé tout de suite, rendu à l'échec.
@MainActor
final class BatteryReceiveModeChoiceTests: XCTestCase {

    /// Un Proche : le réglage n'existe qu'à partir de ce niveau (#14147).
    private func closeRelations() -> MockRelationsService {
        let relations = MockRelationsService()
        relations.linkResult = .success(RelationLink(userId: "peer", effectiveLevel: .close, grantedByMe: .close, accessLevel: nil))
        return relations
    }

    func test_setReceive_appliesAndSends() async {
        let service = MockBatteryService()
        let sut = BatteryReceiveModeViewModel(userId: "peer", service: service, relations: closeRelations())
        await sut.load()
        await sut.setReceive(.pill)
        XCTAssertEqual(sut.settings?.receive, .pill)
        XCTAssertEqual(service.updatePersonSettingsCalls.first?.receive, .pill)
    }

    func test_setReceive_failure_restores() async {
        let service = MockBatteryService()
        service.updatePersonSettingsResult = .failure(URLError(.timedOut))
        let sut = BatteryReceiveModeViewModel(userId: "peer", service: service, relations: closeRelations())
        await sut.load()
        await sut.setReceive(.none)
        XCTAssertEqual(sut.settings?.receive, .all)
        XCTAssertNotNil(sut.notice)
    }

    func test_load_refused_showsNothing() async {
        let service = MockBatteryService()
        service.personSettingsResult = .failure(URLError(.userAuthenticationRequired))
        let sut = BatteryReceiveModeViewModel(userId: "peer", service: service, relations: closeRelations())
        await sut.load()
        XCTAssertNil(sut.settings)
    }
}

/// Le réglage global de l'émetteur.
@MainActor
final class BatterySharingSettingsViewModelTests: XCTestCase {

    func test_load_thenTurnOff_sendsTheChoice() async {
        let service = MockBatteryService()
        let sut = BatterySharingSettingsViewModel(service: service)
        await sut.load()
        XCTAssertEqual(sut.sharingEnabled, true)
        await sut.setSharing(false)
        XCTAssertEqual(sut.sharingEnabled, false)
        XCTAssertEqual(service.updateEmitterSettingsCalls, [false])
    }

    func test_setSharing_failure_restores() async {
        let service = MockBatteryService()
        service.updateEmitterSettingsResult = .failure(URLError(.timedOut))
        let sut = BatterySharingSettingsViewModel(service: service)
        await sut.load()
        await sut.setSharing(false)
        XCTAssertEqual(sut.sharingEnabled, true)
    }
}
