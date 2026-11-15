import XCTest
import MeeshySDK
@testable import Meeshy

/// « Sa batterie » dans les réglages d'un direct (#14147) : le réglage n'existe qu'à partir de Proche (verdict servi
/// compris, pour l'équipe). Sous Proche, la section ne charge rien et ne s'affiche pas — comme le web et Android.
@MainActor
final class BatteryReceiveModeViewModelTests: XCTestCase {

    private func makeSUT(level: RelationLevel?, accessLevel: RelationLevel? = nil) -> (BatteryReceiveModeViewModel, MockBatteryService, MockRelationsService) {
        let service = MockBatteryService()
        let relations = MockRelationsService()
        if let level {
            relations.linkResult = .success(RelationLink(userId: "peer", effectiveLevel: level, grantedByMe: level, accessLevel: accessLevel))
        }
        let sut = BatteryReceiveModeViewModel(userId: "peer", service: service, relations: relations)
        return (sut, service, relations)
    }

    func test_load_withAFriend_showsNothing() async {
        let (sut, _, _) = makeSUT(level: .friend)
        await sut.load()
        XCTAssertNil(sut.settings)
    }

    func test_load_withoutAnyLink_showsNothing() async {
        let (sut, _, _) = makeSUT(level: nil)
        await sut.load()
        XCTAssertNil(sut.settings)
    }

    func test_load_withAClose_showsTheReceiveMode() async {
        let (sut, _, _) = makeSUT(level: .close)
        await sut.load()
        XCTAssertEqual(sut.settings?.receive, .all)
    }

    func test_load_teamColleague_servedAsBlood_showsTheReceiveMode() async {
        let (sut, _, _) = makeSUT(level: .acquaintance, accessLevel: .blood)
        await sut.load()
        XCTAssertNotNil(sut.settings)
    }
}
