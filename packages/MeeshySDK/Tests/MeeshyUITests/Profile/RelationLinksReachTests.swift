import XCTest
import MeeshySDK
@testable import MeeshyUI

/// #19444 — la face Liens d'un autre montre ce que mon cercle tient fermé (un compte, le cercle qui l'ouvre) et ses
/// communautés ouvertes, qu'on rejoint d'un geste, l'appartenance montrée avant la réponse du serveur.
@MainActor
final class RelationLinksReachTests: XCTestCase {

    private func community(id: String = "c1", isMember: Bool? = nil, members: Int? = 1204) -> ProfileOpenCommunity {
        ProfileOpenCommunity(id: id, identifier: "photo-rue", name: "Photo de rue", memberCount: members,
                             isMember: isMember)
    }

    func test_join_showsTheMembershipAtOnce_andKeepsItWhenTheServerAgrees() {
        var joins = RelationCommunityJoins()
        let started = joins.begin(community())
        XCTAssertTrue(started)
        XCTAssertTrue(joins.isMember(community()))
        XCTAssertTrue(joins.isPending("c1"))
        joins.settle("c1", succeeded: true)
        XCTAssertTrue(joins.isMember(community()))
        XCTAssertFalse(joins.isPending("c1"))
    }

    func test_join_isUndone_whenTheServerRefuses() {
        var joins = RelationCommunityJoins()
        _ = joins.begin(community())
        joins.settle("c1", succeeded: false)
        XCTAssertFalse(joins.isMember(community()))
        XCTAssertFalse(joins.isPending("c1"))
    }

    func test_join_doesNotLeaveTwice_norForACommunityIAmAlreadyIn() {
        var joins = RelationCommunityJoins()
        _ = joins.begin(community())
        let twice = joins.begin(community())
        XCTAssertFalse(twice)
        var fresh = RelationCommunityJoins()
        let alreadyIn = fresh.begin(community(id: "c2", isMember: true))
        XCTAssertFalse(alreadyIn)
        XCTAssertTrue(fresh.isMember(community(id: "c2", isMember: true)))
    }

    func test_status_saysTheMembersOrThatIAmIn() {
        XCTAssertEqual(RelationLinksReachCopy.status(of: community(), isMember: true), RelationLinksReachCopy.member)
        XCTAssertEqual(RelationLinksReachCopy.status(of: community(), isMember: false),
                       ProfileInCommonCopy.members(1204))
        XCTAssertNil(RelationLinksReachCopy.status(of: community(members: nil), isMember: false))
    }

    /// Loi 12 et #19674 — ce que mon cercle tient fermé ne se montre plus, pas même verrouillé ; les communautés sont
    /// des billets du kit, rien n'est dessiné sur place.
    func test_reach_isMadeOfTheKit_andShowsNothingLocked() throws {
        let reach = try source("RelationLinksReach.swift")
        XCTAssertFalse(reach.contains("MeeshyLockedRow("))
        XCTAssertTrue(reach.contains("MeeshyTicket("))
        XCTAssertTrue(reach.contains("MeeshyButton("))
        XCTAssertFalse(reach.contains("RoundedRectangle("), "aucun composant redessiné sur place")
        let face = try source("UserProfileSheet+LinksFace.swift")
        XCTAssertFalse(face.contains("RelationLockedAddressRows("))
        XCTAssertFalse(face.contains("lockedAddresses"))
        XCTAssertTrue(face.contains("RelationOpenCommunitiesSection("))
    }

    private func source(_ name: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Profile/\(name)")
        return try String(contentsOf: url, encoding: .utf8)
    }
}
