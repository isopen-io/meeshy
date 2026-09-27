import XCTest
import MeeshySDK
@testable import Meeshy

/// #8395 — la mise à la une d'un appel de groupe : toucher une vignette la met
/// à la une, un partage d'écran y monte seul, le choix manuel l'emporte, et la
/// fin d'un partage rend la grille.
@MainActor
final class GroupCallSpotlightTests: XCTestCase {

    private func roster(sharing: String? = nil) -> GroupCallRoster {
        let base = GroupCallRoster(localUserId: "me")
            .admitting(GroupCallArrival(userId: "b", displayName: "Bob"), isPrimary: true)
            .admitting(GroupCallArrival(userId: "c", displayName: "Chloé"))
            .admitting(GroupCallArrival(userId: "d", displayName: "Dan"))
        guard let sharing else { return base }
        return base.applying(.screen, enabled: true, for: sharing)
    }

    private func tiles(sharing: String? = nil) -> [GroupCallStageTile] {
        GroupCallStage.tiles(
            roster: roster(sharing: sharing),
            speakingUserIds: [],
            localName: "Vous",
            isLocalMicMuted: false,
            isLocalVideoEnabled: false,
            isPrimaryVideoActive: false
        )
    }

    // MARK: - Automatique

    func test_focus_noShareNoChoice_returnsGrid() {
        XCTAssertEqual(GroupCallSpotlight.focus(tiles: tiles(), choice: nil), .grid)
    }

    func test_focus_memberSharesScreen_promotesSharerAsScreenShare() {
        XCTAssertEqual(
            GroupCallSpotlight.focus(tiles: tiles(sharing: "c"), choice: nil),
            .spotlight(tileId: "c", isScreenShare: true)
        )
    }

    // MARK: - Manuel prioritaire

    func test_focus_tappedTile_promotesThatTile() {
        XCTAssertEqual(
            GroupCallSpotlight.focus(tiles: tiles(), choice: .tile("d")),
            .spotlight(tileId: "d", isScreenShare: false)
        )
    }

    func test_focus_manualTileWhileAnotherShares_manualWins() {
        XCTAssertEqual(
            GroupCallSpotlight.focus(tiles: tiles(sharing: "c"), choice: .tile("b")),
            .spotlight(tileId: "b", isScreenShare: false)
        )
    }

    func test_focus_manualGridWhileSharing_gridWins() {
        XCTAssertEqual(GroupCallSpotlight.focus(tiles: tiles(sharing: "c"), choice: .grid), .grid)
    }

    func test_focus_pinnedTileLeft_fallsBackToAutomatic() {
        XCTAssertEqual(GroupCallSpotlight.focus(tiles: tiles(), choice: .tile("gone")), .grid)
        XCTAssertEqual(
            GroupCallSpotlight.focus(tiles: tiles(sharing: "c"), choice: .tile("gone")),
            .spotlight(tileId: "c", isScreenShare: true)
        )
    }

    func test_focus_localTileChosen_isNeverAScreenShare() {
        XCTAssertEqual(
            GroupCallSpotlight.focus(tiles: tiles(), choice: .tile(GroupCallStage.localTileId)),
            .spotlight(tileId: GroupCallStage.localTileId, isScreenShare: false)
        )
    }

    // MARK: - Fin du partage

    func test_focus_shareEnds_returnsGrid() {
        let during = GroupCallSpotlight.focus(tiles: tiles(sharing: "c"), choice: nil)
        let after = GroupCallSpotlight.focus(tiles: tiles(), choice: nil)
        XCTAssertEqual(during, .spotlight(tileId: "c", isScreenShare: true))
        XCTAssertEqual(after, .grid)
    }

    func test_choice_gridOverride_isClearedWhenTheSharerChanges() {
        XCTAssertNil(GroupCallSpotlight.choice(.grid, afterSharerChangedFrom: "c", to: nil))
        XCTAssertNil(GroupCallSpotlight.choice(.grid, afterSharerChangedFrom: nil, to: "d"))
    }

    func test_choice_pinnedTile_survivesASharerChange() {
        XCTAssertEqual(GroupCallSpotlight.choice(.tile("b"), afterSharerChangedFrom: "c", to: nil), .tile("b"))
    }

    func test_choice_sameSharer_keepsGridOverride() {
        XCTAssertEqual(GroupCallSpotlight.choice(.grid, afterSharerChangedFrom: "c", to: "c"), .grid)
    }

    func test_sharerId_returnsFirstRemoteSharerInArrivalOrder() {
        XCTAssertEqual(GroupCallSpotlight.sharerId(in: tiles(sharing: "d")), "d")
        XCTAssertNil(GroupCallSpotlight.sharerId(in: tiles()))
    }

    // MARK: - Pincer pour zoomer

    func test_clampedZoom_staysBetweenOneAndFour() {
        XCTAssertEqual(GroupCallSpotlight.clampedZoom(0.4), 1)
        XCTAssertEqual(GroupCallSpotlight.clampedZoom(2.5), 2.5)
        XCTAssertEqual(GroupCallSpotlight.clampedZoom(9), GroupCallSpotlight.maxZoom)
    }
}
