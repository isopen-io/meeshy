import XCTest
import SwiftUI
import MeeshySDK
@testable import MeeshyUI

/// #18870 — la face Actions de la fiche d'un autre range TOUTES les opérations existantes, offertes ou verrouillées
/// selon le cercle commun ; ce qui est fermé dit le cercle qui l'ouvre (loi 4).
@MainActor
final class ProfileRelationActionTests: XCTestCase {

    func test_allCases_listEveryExistingOperation_inThePlancheOrder() {
        XCTAssertEqual(ProfileRelationAction.allCases, [
            .write, .call, .video, .talkie, .together, .bring, .location, .battery, .unreachable,
            .sendProfile, .block, .report
        ])
    }

    func test_gate_atPublic_offersWritingCallsAndTheSafetyActions() {
        let offered = ProfileRelationAction.allCases.filter { $0.gate(at: .public) == .offered }
        XCTAssertEqual(offered, [.write, .call, .video, .sendProfile, .block, .report])
    }

    func test_gate_atPublic_locksEachCircleToolWithTheCircleThatOpensIt() {
        XCTAssertEqual(ProfileRelationAction.bring.gate(at: .public), .locked(opensAt: .friend))
        XCTAssertEqual(ProfileRelationAction.location.gate(at: .acquaintance), .locked(opensAt: .friend))
        XCTAssertEqual(ProfileRelationAction.talkie.gate(at: .friend), .locked(opensAt: .close))
        XCTAssertEqual(ProfileRelationAction.together.gate(at: .friend), .locked(opensAt: .close))
        XCTAssertEqual(ProfileRelationAction.battery.gate(at: .friend), .locked(opensAt: .close))
        XCTAssertEqual(ProfileRelationAction.unreachable.gate(at: .community), .locked(opensAt: .close))
    }

    func test_gate_atClose_offersEveryOperation() {
        XCTAssertTrue(ProfileRelationAction.allCases.allSatisfy { $0.gate(at: .close) == .offered })
    }

    func test_writing_isARequestBelowAcquaintance_andDirectFromIt() {
        XCTAssertTrue(ProfileRelationAction.writesARequest(at: .public))
        XCTAssertTrue(ProfileRelationAction.writesARequest(at: .community))
        XCTAssertFalse(ProfileRelationAction.writesARequest(at: .acquaintance))
        XCTAssertFalse(ProfileRelationAction.writesARequest(at: .blood))
    }

    func test_lockedGroups_atFriend_groupCloseToolsUnderClose() {
        let groups = ProfileRelationAction.lockedGroups(at: .friend)
        XCTAssertEqual(groups.map(\.opensAt), [.close])
        XCTAssertEqual(groups.first?.actions, [.talkie, .together, .battery, .unreachable])
    }

    func test_lockedGroups_atPublic_orderGroupsFromTheNearestCircle() {
        let groups = ProfileRelationAction.lockedGroups(at: .public)
        XCTAssertEqual(groups.map(\.opensAt), [.friend, .close])
        XCTAssertEqual(groups.first?.actions, [.bring, .location])
    }

    func test_lockedGroups_atClose_isEmpty() {
        XCTAssertTrue(ProfileRelationAction.lockedGroups(at: .close).isEmpty)
        XCTAssertTrue(ProfileRelationAction.lockedGroups(at: .blood).isEmpty)
    }

    func test_onlyBlockAndReport_areDestructive() {
        let destructive = ProfileRelationAction.allCases.filter(\.isDestructive)
        XCTAssertEqual(destructive, [.block, .report])
    }

    func test_everyAction_hasATitleAndAGlyph() {
        for action in ProfileRelationAction.allCases {
            XCTAssertFalse(action.title.isEmpty, "\(action)")
            XCTAssertFalse(action.systemImage.isEmpty, "\(action)")
        }
    }

    func test_lockedGroupTitle_joinsTheNamesOfTheGroup() {
        let group = ProfileRelationLockedGroup(opensAt: .close, actions: [.talkie, .together])
        let title = group.title(locale: Locale(identifier: "fr_FR"))
        XCTAssertTrue(title.contains(ProfileRelationAction.talkie.title), title)
        XCTAssertTrue(title.contains(ProfileRelationAction.together.title), title)
    }

    func test_requirement_namesTheCircleThatOpensTheGroup_andDiffersByCircle() {
        let friend = ProfileRelationLockedGroup(opensAt: .friend, actions: [.bring]).requirement
        let close = ProfileRelationLockedGroup(opensAt: .close, actions: [.talkie]).requirement
        XCTAssertFalse(friend.isEmpty)
        XCTAssertNotEqual(friend, close)
        XCTAssertEqual(Set(RelationLevel.allCases.map { ProfileRelationLockedGroup.requirement(opensAt: $0) }).count,
                       RelationLevel.allCases.count)
    }

    /// #19637 — le cercle reçoit l'accent de la fiche tel quel : la teinte quand la fiche en remet une, `nil` sinon,
    /// pour que « Partager ma position » retombe sur la couleur du cercle commun au lieu d'une teinte transparente.
    func test_relationSlot_handsTheSheetAccentToTheCircle_andNilWhenTheSheetHasNone() {
        var received: [Color?] = []
        let section = ProfileRelationSection { _, _, _, tint in
            received.append(tint)
            return AnyView(EmptyView())
        }
        _ = ProfileRelationSlot(section: section, userId: "u1", displayName: "Léo", linked: .constant(false),
                                tint: .red) { EmptyView() }.body
        _ = ProfileRelationSlot(section: section, userId: "u1", displayName: "Léo", linked: .constant(false),
                                tint: nil) { EmptyView() }.body
        XCTAssertEqual(received, [.red, nil])
    }
}
