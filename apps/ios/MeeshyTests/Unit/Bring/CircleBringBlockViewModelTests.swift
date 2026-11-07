import XCTest
import MeeshySDK
@testable import Meeshy

/// « Bloquer ses Bring » (#13936) : lu depuis la passerelle, basculé au geste, rendu à l'état d'avant sur un refus.
@MainActor
final class CircleBringBlockViewModelTests: XCTestCase {

    func test_load_readsTheServedSetting() async {
        let service = MockBringService()
        service.settingsResult = .success(RelationPersonSettings(userId: "bob", bringBlocked: true))
        let sut = CircleBringBlockViewModel(userId: "bob", service: service)

        await sut.load()

        XCTAssertTrue(sut.blocked)
    }

    func test_block_isWrittenAndKept() async {
        let service = MockBringService()
        service.setBlockedResult = .success(RelationPersonSettings(userId: "bob", bringBlocked: true))
        let sut = CircleBringBlockViewModel(userId: "bob", service: service)

        let saved = await sut.setBlocked(true)

        XCTAssertTrue(saved)
        XCTAssertTrue(sut.blocked)
        XCTAssertEqual(service.blockedWrites, [true])
    }

    func test_aRefusedWrite_rollsBackAndSaysSo() async {
        let service = MockBringService()
        let sut = CircleBringBlockViewModel(userId: "bob", service: service)

        let saved = await sut.setBlocked(true)

        XCTAssertFalse(saved)
        XCTAssertFalse(sut.blocked)
        XCTAssertNotNil(sut.notice)
    }
}
