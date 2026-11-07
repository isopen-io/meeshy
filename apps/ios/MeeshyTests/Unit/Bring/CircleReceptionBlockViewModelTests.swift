import XCTest
import MeeshySDK
@testable import Meeshy

/// « Bloquer ses Bring » (#13936) et « Couper son talkie » (#16673) : lus depuis la passerelle, basculés au geste,
/// rendus à l'état d'avant sur un refus — chacun n'écrit QUE son champ.
@MainActor
final class CircleReceptionBlockViewModelTests: XCTestCase {

    func test_load_readsTheServedSetting() async {
        let service = MockBringService()
        service.settingsResult = .success(RelationPersonSettings(userId: "bob", bringBlocked: true))
        let sut = CircleReceptionBlockViewModel(userId: "bob", setting: .bring, service: service)

        await sut.load()

        XCTAssertTrue(sut.blocked)
    }

    func test_load_readsOnlyItsOwnSetting() async {
        let service = MockBringService()
        service.settingsResult = .success(RelationPersonSettings(userId: "bob", bringBlocked: true, talkieBlocked: false))
        let sut = CircleReceptionBlockViewModel(userId: "bob", setting: .talkie, service: service)

        await sut.load()

        XCTAssertFalse(sut.blocked)
    }

    func test_block_isWrittenAndKept() async {
        let service = MockBringService()
        service.setBlockedResult = .success(RelationPersonSettings(userId: "bob", bringBlocked: true))
        let sut = CircleReceptionBlockViewModel(userId: "bob", setting: .bring, service: service)

        let saved = await sut.setBlocked(true)

        XCTAssertTrue(saved)
        XCTAssertTrue(sut.blocked)
        XCTAssertEqual(service.blockedWrites, [true])
        XCTAssertEqual(service.blockedSettings, [.bring])
    }

    func test_muteTalkie_writesTheTalkieField() async {
        let service = MockBringService()
        service.setBlockedResult = .success(RelationPersonSettings(userId: "bob", bringBlocked: false, talkieBlocked: true))
        let sut = CircleReceptionBlockViewModel(userId: "bob", setting: .talkie, service: service)

        let saved = await sut.setBlocked(true)

        XCTAssertTrue(saved)
        XCTAssertTrue(sut.blocked)
        XCTAssertEqual(service.blockedSettings, [.talkie])
    }

    func test_aRefusedWrite_rollsBackAndSaysSo() async {
        let service = MockBringService()
        let sut = CircleReceptionBlockViewModel(userId: "bob", setting: .talkie, service: service)

        let saved = await sut.setBlocked(true)

        XCTAssertFalse(saved)
        XCTAssertFalse(sut.blocked)
        XCTAssertNotNil(sut.notice)
    }

    func test_theSheetOffersTalkieAsALiveSettingFromClose() {
        XCTAssertEqual(CirclePersonSetting.talkie.receptionSetting, .talkie)
        XCTAssertEqual(CirclePersonSetting.blockBring.receptionSetting, .bring)
        XCTAssertNil(CirclePersonSetting.listening.receptionSetting)
        XCTAssertNil(CirclePersonSetting.liveLocation.receptionSetting)
        XCTAssertFalse(CirclePersonSetting.offered(at: .friend).contains(.talkie))
        XCTAssertTrue(CirclePersonSetting.offered(at: .close).contains(.talkie))
    }
}
