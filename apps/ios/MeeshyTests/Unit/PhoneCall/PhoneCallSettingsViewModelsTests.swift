import XCTest
import MeeshySDK
@testable import Meeshy

/// Les réglages d'« en appel » (#18753) : « Montrer à mes Sangs que je suis en appel » pour tous, et le partage avec une
/// personne depuis sa fiche — posés tout de suite, rendus à l'échec.
@MainActor
final class PhoneCallSettingsViewModelsTests: XCTestCase {

    private func makeSharing() -> (PhoneCallSharingSettingsViewModel, MockPhoneCallService) {
        let service = MockPhoneCallService()
        return (PhoneCallSharingSettingsViewModel(service: service), service)
    }

    private func makePerson() -> (ProfilePhoneCallViewModel, MockPhoneCallService) {
        let service = MockPhoneCallService()
        return (ProfilePhoneCallViewModel(userId: "peer", service: service), service)
    }

    func test_load_showsTheServedSharing() async {
        let (sut, service) = makeSharing()
        service.emitterSettingsResult = .success(PhoneCallEmitterSettings(sharingEnabled: false))
        await sut.load()
        XCTAssertEqual(sut.sharingEnabled, false)
    }

    func test_load_failure_showsNoToggle() async {
        let (sut, service) = makeSharing()
        service.emitterSettingsResult = .failure(URLError(.notConnectedToInternet))
        await sut.load()
        XCTAssertNil(sut.sharingEnabled)
    }

    func test_setSharing_putsTheChoice() async {
        let (sut, service) = makeSharing()
        await sut.load()
        await sut.setSharing(false)
        XCTAssertEqual(sut.sharingEnabled, false)
        XCTAssertEqual(service.updateEmitterSettingsCalls, [false])
    }

    func test_setSharing_failure_restoresThePreviousChoice_andSaysIt() async {
        let (sut, service) = makeSharing()
        await sut.load()
        service.updateEmitterSettingsResult = .failure(URLError(.timedOut))
        await sut.setSharing(false)
        XCTAssertEqual(sut.sharingEnabled, true)
        XCTAssertEqual(sut.notice, PhoneCallWording.saveFailed)
    }

    func test_person_load_showsTheServedSharing() async {
        let (sut, service) = makePerson()
        service.personSettingsResult = .success(PhoneCallPersonSettings(userId: "peer", isShared: false))
        await sut.load()
        XCTAssertEqual(sut.settings?.isShared, false)
    }

    func test_person_withdraw_isOptimistic_andPutsIt() async {
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
        XCTAssertEqual(sut.notice, PhoneCallWording.saveFailed)
    }

    func test_offersPhoneCall_onlyBetweenBlood() {
        XCTAssertEqual(RelationFeature.deviceCall.minimumLevel, .blood)
    }
}
