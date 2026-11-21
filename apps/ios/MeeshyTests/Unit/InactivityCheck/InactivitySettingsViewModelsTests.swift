import XCTest
import MeeshySDK
@testable import Meeshy

/// Les réglages de la vérification d'inactivité (#18738) : le délai pour tous (6, 12, 24 h ou coupée) et « Prévenir si
/// je ne réponds pas » pour une personne — posés tout de suite, rendus à l'échec.
@MainActor
final class InactivitySettingsViewModelsTests: XCTestCase {

    private func makeSettings() -> (InactivityCheckSettingsViewModel, MockInactivityCheckService) {
        let service = MockInactivityCheckService()
        return (InactivityCheckSettingsViewModel(service: service), service)
    }

    private func makePerson() -> (ProfileInactivityViewModel, MockInactivityCheckService) {
        let service = MockInactivityCheckService()
        return (ProfileInactivityViewModel(userId: "peer", service: service), service)
    }

    func test_load_showsTheServedDelay() async {
        let (sut, service) = makeSettings()
        service.settingsResult = .success(InactivityCheckSettings(delay: .off))
        await sut.load()
        XCTAssertEqual(sut.delay, .off)
    }

    func test_load_failure_showsNoPicker() async {
        let (sut, service) = makeSettings()
        service.settingsResult = .failure(URLError(.notConnectedToInternet))
        await sut.load()
        XCTAssertNil(sut.delay)
    }

    func test_setDelay_putsTheChoice() async {
        let (sut, service) = makeSettings()
        await sut.load()
        await sut.setDelay(.sixHours)
        XCTAssertEqual(sut.delay, .sixHours)
        XCTAssertEqual(service.updateSettingsCalls, [.sixHours])
    }

    func test_setDelay_failure_restoresThePreviousChoice_andSaysIt() async {
        let (sut, service) = makeSettings()
        await sut.load()
        service.updateSettingsResult = .failure(URLError(.timedOut))
        await sut.setDelay(.off)
        XCTAssertEqual(sut.delay, .twelveHours)
        XCTAssertEqual(sut.notice, InactivityCheckWording.saveFailed)
    }

    func test_person_load_showsTheServedSharing() async {
        let (sut, service) = makePerson()
        service.personSettingsResult = .success(InactivityPersonSettings(userId: "peer", isShared: false))
        await sut.load()
        XCTAssertEqual(sut.settings?.isShared, false)
    }

    func test_person_withdraw_putsIt() async {
        let (sut, service) = makePerson()
        await sut.load()
        await sut.setShared(false)
        XCTAssertEqual(sut.settings?.isShared, false)
        XCTAssertEqual(service.updatePersonSettingsCalls, [false])
    }

    func test_person_failure_restoresTheSharing_andSaysIt() async {
        let (sut, service) = makePerson()
        await sut.load()
        service.updatePersonSettingsResult = .failure(URLError(.timedOut))
        await sut.setShared(false)
        XCTAssertEqual(sut.settings?.isShared, true)
        XCTAssertEqual(sut.notice, InactivityCheckWording.saveFailed)
    }

    func test_offersInactivity_onlyBetweenBlood() {
        XCTAssertEqual(RelationFeature.safetyInactivity.minimumLevel, .blood)
    }
}
