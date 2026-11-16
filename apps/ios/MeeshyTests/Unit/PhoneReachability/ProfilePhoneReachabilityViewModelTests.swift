import XCTest
import MeeshySDK
@testable import Meeshy

/// Le téléphone injoignable sur une fiche (#18737) : à Proche, l'offre « Prévenir {name} » n'arrive qu'une fois et sa
/// case n'est jamais cochée d'avance ; entre Sangs, le partage est déjà actif et se retire.
@MainActor
final class ProfilePhoneReachabilityViewModelTests: XCTestCase {

    private func makeSUT(shared: Bool = false) -> (ProfilePhoneReachabilityViewModel, MockPhoneReachabilityService, MemoryPhoneReachabilityConsent) {
        let service = MockPhoneReachabilityService()
        service.personSettingsResult = .success(PhoneReachabilityPersonSettings(userId: "peer", isShared: shared))
        let consent = MemoryPhoneReachabilityConsent()
        let sut = ProfilePhoneReachabilityViewModel(userId: "peer", service: service, consent: consent, viewerId: { "me" })
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

    func test_load_refused_showsNothing() async {
        let (sut, service, _) = makeSUT()
        service.personSettingsResult = .failure(URLError(.userAuthenticationRequired))
        await sut.load(asksConsent: true)
        XCTAssertNil(sut.settings)
        XCTAssertFalse(sut.showsConsentOffer)
    }

    func test_answerConsent_unchecked_sharesNothing_andNeverAsksAgain() async {
        let (sut, service, consent) = makeSUT()
        await sut.load(asksConsent: true)
        await sut.answerConsent()
        XCTAssertTrue(service.updatePersonSettingsCalls.isEmpty)
        XCTAssertFalse(sut.showsConsentOffer)

        let again = ProfilePhoneReachabilityViewModel(userId: "peer", service: service, consent: consent, viewerId: { "me" })
        await again.load(asksConsent: true)
        XCTAssertFalse(again.showsConsentOffer)
    }

    func test_answerConsent_checked_sharesWithThePerson() async {
        let (sut, service, _) = makeSUT()
        await sut.load(asksConsent: true)
        sut.consentChecked = true
        await sut.answerConsent()
        XCTAssertEqual(service.updatePersonSettingsCalls, [true])
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
}

/// Le réglage global de l'émetteur : prévenir mes Proches si mon téléphone est injoignable.
@MainActor
final class PhoneReachabilitySharingSettingsViewModelTests: XCTestCase {

    func test_load_thenTurnOff_sendsTheChoice() async {
        let service = MockPhoneReachabilityService()
        let sut = PhoneReachabilitySharingSettingsViewModel(service: service)
        await sut.load()
        XCTAssertEqual(sut.sharingEnabled, true)
        await sut.setSharing(false)
        XCTAssertEqual(sut.sharingEnabled, false)
        XCTAssertEqual(service.updateEmitterSettingsCalls, [false])
    }

    func test_setSharing_failure_restores() async {
        let service = MockPhoneReachabilityService()
        service.updateEmitterSettingsResult = .failure(URLError(.timedOut))
        let sut = PhoneReachabilitySharingSettingsViewModel(service: service)
        await sut.load()
        await sut.setSharing(false)
        XCTAssertEqual(sut.sharingEnabled, true)
        XCTAssertNotNil(sut.notice)
    }
}
