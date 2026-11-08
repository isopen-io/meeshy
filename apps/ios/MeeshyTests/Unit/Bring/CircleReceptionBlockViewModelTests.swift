import XCTest
import MeeshySDK
@testable import Meeshy

/// « Bloquer ses Bring » (#13936), « Couper son talkie » (#16673) et « Ce que j'écoute » (#16803) : lus depuis
/// la passerelle, basculés au geste, rendus à l'état d'avant sur un refus — chacun n'écrit QUE son champ.
@MainActor
final class CircleReceptionBlockViewModelTests: XCTestCase {

    @MainActor
    private final class Calls {
        var count = 0
    }

    func test_load_readsTheServedSetting() async {
        let service = MockBringService()
        service.settingsResult = .success(RelationPersonSettings(userId: "bob", bringBlocked: true))
        let sut = CircleReceptionBlockViewModel(userId: "bob", setting: .bring, service: service)

        await sut.load()

        XCTAssertTrue(sut.isOn)
    }

    func test_load_readsOnlyItsOwnSetting() async {
        let service = MockBringService()
        service.settingsResult = .success(RelationPersonSettings(userId: "bob", bringBlocked: true, talkieBlocked: false))
        let sut = CircleReceptionBlockViewModel(userId: "bob", setting: .talkie, service: service)

        await sut.load()

        XCTAssertFalse(sut.isOn)
    }

    func test_block_isWrittenAndKept() async {
        let service = MockBringService()
        service.setBlockedResult = .success(RelationPersonSettings(userId: "bob", bringBlocked: true))
        let sut = CircleReceptionBlockViewModel(userId: "bob", setting: .bring, service: service)

        let saved = await sut.setOn(true)

        XCTAssertTrue(saved)
        XCTAssertTrue(sut.isOn)
        XCTAssertEqual(service.blockedWrites, [true])
        XCTAssertEqual(service.blockedSettings, [.bring])
    }

    func test_muteTalkie_writesTheTalkieField() async {
        let service = MockBringService()
        service.setBlockedResult = .success(RelationPersonSettings(userId: "bob", bringBlocked: false, talkieBlocked: true))
        let sut = CircleReceptionBlockViewModel(userId: "bob", setting: .talkie, service: service)

        let saved = await sut.setOn(true)

        XCTAssertTrue(saved)
        XCTAssertTrue(sut.isOn)
        XCTAssertEqual(service.blockedSettings, [.talkie])
    }

    func test_aRefusedWrite_rollsBackAndSaysSo() async {
        let service = MockBringService()
        let sut = CircleReceptionBlockViewModel(userId: "bob", setting: .talkie, service: service)

        let saved = await sut.setOn(true)

        XCTAssertFalse(saved)
        XCTAssertFalse(sut.isOn)
        XCTAssertNotNil(sut.notice)
    }

    func test_theSheetOffersTalkieAsALiveSettingFromClose() {
        XCTAssertEqual(CirclePersonSetting.talkie.personSwitch, .reception(.talkie))
        XCTAssertEqual(CirclePersonSetting.blockBring.personSwitch, .reception(.bring))
        XCTAssertEqual(CirclePersonSetting.listening.personSwitch, .share(.listeningCategory))
        XCTAssertNil(CirclePersonSetting.liveLocation.personSwitch)
        XCTAssertFalse(CirclePersonSetting.offered(at: .friend).contains(.talkie))
        XCTAssertTrue(CirclePersonSetting.offered(at: .close).contains(.talkie))
    }

    // MARK: - Partager ce que j'écoute (#16803)

    func test_listeningShare_isRefusedByDefault_evenFromAnOldServer() async {
        let service = MockBringService()
        let oldServer = try? JSONDecoder().decode(
            RelationPersonSettings.self, from: Data(#"{"userId":"bob","bringBlocked":false}"#.utf8)
        )
        XCTAssertEqual(oldServer?.listeningCategoryShared, false)
        service.settingsResult = oldServer.map { .success($0) } ?? .failure(NSError(domain: "decode", code: 0))
        let sut = CircleReceptionBlockViewModel(userId: "bob", personSwitch: .share(.listeningCategory), service: service)

        await sut.load()

        XCTAssertFalse(sut.isOn)
    }

    func test_listeningShare_readsTheGrantNotABlock() async {
        let service = MockBringService()
        service.settingsResult = .success(
            RelationPersonSettings(userId: "bob", bringBlocked: true, talkieBlocked: true, listeningCategoryShared: false)
        )
        let sut = CircleReceptionBlockViewModel(userId: "bob", personSwitch: .share(.listeningCategory), service: service)

        await sut.load()

        XCTAssertFalse(sut.isOn)
    }

    func test_grantingTheListeningShare_writesOnlyItsField_andTurnsTheEmitterOn() async {
        let service = MockBringService()
        service.setBlockedResult = .success(RelationPersonSettings(userId: "bob", bringBlocked: false, listeningCategoryShared: true))
        let emitterTurnedOn = Calls()
        let sut = CircleReceptionBlockViewModel(
            userId: "bob", personSwitch: .share(.listeningCategory), service: service,
            afterGrant: { emitterTurnedOn.count += 1; return nil }
        )

        let saved = await sut.setOn(true)

        XCTAssertTrue(saved)
        XCTAssertTrue(sut.isOn)
        XCTAssertEqual(service.grantedShares, [.listeningCategory])
        XCTAssertEqual(service.grantWrites, [true])
        XCTAssertTrue(service.blockedSettings.isEmpty)
        XCTAssertEqual(emitterTurnedOn.count, 1)
        XCTAssertNil(sut.notice)
    }

    func test_grantingTheListeningShare_withoutMediaAccess_saysSo() async {
        let service = MockBringService()
        service.setBlockedResult = .success(RelationPersonSettings(userId: "bob", bringBlocked: false, listeningCategoryShared: true))
        let sut = CircleReceptionBlockViewModel(
            userId: "bob", personSwitch: .share(.listeningCategory), service: service,
            afterGrant: { "accès refusé" }
        )

        await sut.setOn(true)

        XCTAssertTrue(sut.isOn)
        XCTAssertEqual(sut.notice, "accès refusé")
    }

    func test_withdrawingTheListeningShare_neverAsksForAccess() async {
        let service = MockBringService()
        service.settingsResult = .success(RelationPersonSettings(userId: "bob", bringBlocked: false, listeningCategoryShared: true))
        service.setBlockedResult = .success(RelationPersonSettings(userId: "bob", bringBlocked: false, listeningCategoryShared: false))
        let asked = Calls()
        let sut = CircleReceptionBlockViewModel(
            userId: "bob", personSwitch: .share(.listeningCategory), service: service,
            afterGrant: { asked.count += 1; return nil }
        )
        await sut.load()

        await sut.setOn(false)

        XCTAssertFalse(sut.isOn)
        XCTAssertEqual(service.grantWrites, [false])
        XCTAssertEqual(asked.count, 0)
    }

    func test_aBlockNeverTurnsTheEmitterOn() async {
        let service = MockBringService()
        service.setBlockedResult = .success(RelationPersonSettings(userId: "bob", bringBlocked: true))
        let asked = Calls()
        let sut = CircleReceptionBlockViewModel(
            userId: "bob", personSwitch: .reception(.bring), service: service,
            afterGrant: { asked.count += 1; return nil }
        )

        await sut.setOn(true)

        XCTAssertEqual(asked.count, 0)
    }
}
