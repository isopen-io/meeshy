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

    func test_lockedGroups_atFriend_groupCloseToolsUnderClose_andBloodToolsUnderBlood() {
        let groups = RelationCapability.lockedGroups(at: .friend)
        XCTAssertEqual(groups.map(\.opensAt), [.close, .blood])
        XCTAssertEqual(groups.first?.capabilities, [.presenceDetailed, .talkie, .together, .battery, .unreachable])
        XCTAssertEqual(groups.last?.capabilities, [.liveLocation, .locationHistory, .proximity, .batteryPull])
    }

    func test_lockedGroups_atPublic_orderGroupsFromTheNearestCircle() {
        let groups = RelationCapability.lockedGroups(at: .public)
        XCTAssertEqual(groups.map(\.opensAt), [.acquaintance, .friend, .close, .blood])
        let friend = groups.first { $0.opensAt == .friend }
        XCTAssertEqual(friend?.capabilities, [.presenceOnline, .bring, .sharedLocation])
    }

    /// Planche `Autre-Inconnu`, loi 10 : rien de la présence sous Ami — « Pas encore ouvert » le dit ; la présence
    /// détaillée attend Proche.
    func test_lockedGroups_atPublic_namePresenceAtFriend_andDetailedPresenceAtClose() {
        let groups = RelationCapability.lockedGroups(at: .public)
        let friend = groups.first { $0.opensAt == .friend }
        let close = groups.first { $0.opensAt == .close }
        XCTAssertEqual(friend?.capabilities.contains(.presenceOnline), true)
        XCTAssertEqual(close?.capabilities.contains(.presenceDetailed), true)
    }

    /// La rangée verrouillée de la position reprend le mot de la face Actions : « Carte ».
    func test_location_isNamedLikeTheMapAction() {
        XCTAssertEqual(ProfileRelationAction.location.title, ProfileLocationMapAction.title)
    }

    /// Un Proche lit encore ce que la loi d'accès réserve au Sang : position continue, historique, proximité, batterie
    /// à la demande. Seul le Sang n'a plus rien de fermé.
    func test_lockedGroups_atClose_keepTheBloodTools_andAtBloodIsEmpty() {
        let close = RelationCapability.lockedGroups(at: .close)
        XCTAssertEqual(close.map(\.opensAt), [.blood])
        XCTAssertEqual(close.first?.capabilities, [.liveLocation, .locationHistory, .proximity, .batteryPull])
        XCTAssertTrue(RelationCapability.lockedGroups(at: .blood).isEmpty)
    }

    /// UN catalogue : chaque capacité s'ouvre au cercle de la loi d'accès, et écrire directement attend Connaissance.
    func test_capabilities_opensAtTheAccessLawCircle() {
        XCTAssertTrue(RelationCapability.allCases.allSatisfy { $0.opensAt == $0.feature.minimumLevel })
        XCTAssertEqual(RelationCapability.write.feature, .dmDirect)
        XCTAssertEqual(RelationCapability.write.opensAt, .acquaintance)
    }

    func test_opened_listsTheCircleFirst_andIsDisjointFromWhatStaysLocked() {
        let opened = RelationCapability.opened(at: .close)
        let levels = opened.map(\.opensAt)
        XCTAssertEqual(levels, levels.sorted(by: >))
        let locked = RelationCapability.lockedGroups(at: .close).flatMap(\.capabilities)
        XCTAssertTrue(Set(opened).isDisjoint(with: locked))
        XCTAssertEqual(Set(opened).union(locked), Set(RelationCapability.allCases))
    }

    func test_everyCapability_hasATitleAndAGlyph() {
        for capability in RelationCapability.allCases {
            XCTAssertFalse(capability.title.isEmpty, "\(capability)")
            XCTAssertFalse(capability.systemImage.isEmpty, "\(capability)")
        }
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
        let group = ProfileRelationLockedGroup(opensAt: .close, capabilities: [.talkie, .together])
        let title = group.title(locale: Locale(identifier: "fr_FR"))
        XCTAssertTrue(title.contains(RelationCapability.talkie.title), title)
        XCTAssertTrue(title.contains(RelationCapability.together.title), title)
    }

    func test_requirement_namesTheCircleThatOpensTheGroup_andDiffersByCircle() {
        let friend = ProfileRelationLockedGroup(opensAt: .friend, capabilities: [.bring]).requirement
        let close = ProfileRelationLockedGroup(opensAt: .close, capabilities: [.talkie]).requirement
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
