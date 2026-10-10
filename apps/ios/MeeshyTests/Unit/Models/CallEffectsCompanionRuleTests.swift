import XCTest
import CoreGraphics
@testable import Meeshy

/// #8737 — en mode Effets, les autres participants restent visibles : en duo
/// la seule autre personne, en groupe une bande bornée dans l'ordre d'arrivée,
/// l'orateur hors cadre prenant la dernière place, le reste compté par « +N ».
@MainActor
final class CallEffectsCompanionRuleTests: XCTestCase {

    private func groupTiles(speaking: Set<String> = []) -> [GroupCallStageTile] {
        let roster = GroupCallRoster(localUserId: "me", capacity: 12)
            .admitting(GroupCallArrival(userId: "b", displayName: "Bob"), isPrimary: true)
            .admitting(GroupCallArrival(userId: "c", displayName: "Chloé"))
            .admitting(GroupCallArrival(userId: "d", displayName: "Dan"))
            .admitting(GroupCallArrival(userId: "e", displayName: "Emma"))
            .admitting(GroupCallArrival(userId: "f", displayName: "Fatou"))
        return GroupCallStage.tiles(
            roster: roster,
            speakingUserIds: speaking,
            localName: "Vous",
            isLocalMicMuted: false,
            isLocalVideoEnabled: true,
            isPrimaryVideoActive: true
        )
    }

    private func duoTiles(isRemoteVideoOn: Bool = true) -> [GroupCallStageTile] {
        CallEffectsCompanionRule.duoTiles(
            local: CallEffectsDuoPeer(userId: "me", name: "Vous", avatarURL: nil, isVideoOn: true, isMicMuted: false),
            remote: CallEffectsDuoPeer(userId: "bob", name: "Bob", avatarURL: "https://cdn/bob.jpg", isVideoOn: isRemoteVideoOn, isMicMuted: true)
        )
    }

    // MARK: - Qui accompagne mon image

    func test_layout_duo_showsOnlyTheRemote() {
        let layout = CallEffectsCompanionRule.layout(tiles: duoTiles(), featuredId: nil, capacity: 3)

        XCTAssertEqual(layout.stageTileId, GroupCallStage.localTileId)
        XCTAssertEqual(layout.companions.map { $0.id }, ["bob"])
        XCTAssertEqual(layout.overflow, 0)
    }

    func test_layout_group_excludesMeAndKeepsArrivalOrder() {
        let layout = CallEffectsCompanionRule.layout(tiles: groupTiles(), featuredId: nil, capacity: 3)

        XCTAssertEqual(layout.companions.map { $0.id }, ["b", "c", "d"])
        XCTAssertFalse(layout.companions.contains { $0.isLocal })
    }

    func test_layout_aboveCapacity_countsOverflow() {
        let layout = CallEffectsCompanionRule.layout(tiles: groupTiles(), featuredId: nil, capacity: 2)

        XCTAssertEqual(layout.companions.map { $0.id }, ["b", "c"])
        XCTAssertEqual(layout.overflow, 3)
    }

    func test_layout_capacityAboveTheCap_isBoundedToMaxCompanions() {
        let layout = CallEffectsCompanionRule.layout(tiles: groupTiles(), featuredId: nil, capacity: 9)

        XCTAssertEqual(layout.companions.count, CallEffectsCompanionRule.maxCompanions)
        XCTAssertEqual(layout.overflow, 5 - CallEffectsCompanionRule.maxCompanions)
    }

    func test_layout_speakerBeyondCapacity_takesLastSlot() {
        let layout = CallEffectsCompanionRule.layout(tiles: groupTiles(speaking: ["f"]), featuredId: nil, capacity: 3)

        XCTAssertEqual(layout.companions.map { $0.id }, ["b", "c", "f"])
        XCTAssertEqual(layout.overflow, 2)
    }

    func test_layout_speakerAlreadyVisible_keepsTheOrderStable() {
        let layout = CallEffectsCompanionRule.layout(tiles: groupTiles(speaking: ["c", "f"]), featuredId: nil, capacity: 3)

        XCTAssertEqual(layout.companions.map { $0.id }, ["b", "c", "d"])
    }

    func test_layout_noCapacity_countsEveryoneInTheChip() {
        let layout = CallEffectsCompanionRule.layout(tiles: groupTiles(speaking: ["f"]), featuredId: nil, capacity: 0)

        XCTAssertTrue(layout.companions.isEmpty)
        XCTAssertEqual(layout.overflow, 5)
    }

    func test_layout_featuredGone_fallsBackToMe() {
        let layout = CallEffectsCompanionRule.layout(tiles: groupTiles(), featuredId: "gone", capacity: 3)

        XCTAssertEqual(layout.stageTileId, GroupCallStage.localTileId)
        XCTAssertEqual(layout.companions.map { $0.id }, ["b", "c", "d"])
    }

    func test_layout_featuredRemote_putsMeFirst() {
        let layout = CallEffectsCompanionRule.layout(tiles: groupTiles(), featuredId: "d", capacity: 3)

        XCTAssertEqual(layout.stageTileId, "d")
        XCTAssertEqual(layout.companions.map { $0.id }, [GroupCallStage.localTileId, "b", "c"])
        XCTAssertEqual(layout.overflow, 2)
    }

    // MARK: - Combien tiennent

    func test_capacity_wideEnough_fitsTheCapAndTheChip() {
        XCTAssertEqual(
            CallEffectsCompanionRule.capacity(availableWidth: 346, tileWidth: 84, spacing: 8, chipWidth: 44, count: 5),
            3
        )
    }

    func test_capacity_narrowWidth_dropsToTwo() {
        XCTAssertEqual(
            CallEffectsCompanionRule.capacity(availableWidth: 250, tileWidth: 84, spacing: 8, chipWidth: 44, count: 5),
            2
        )
    }

    func test_capacity_everyoneFits_needsNoChip() {
        XCTAssertEqual(
            CallEffectsCompanionRule.capacity(availableWidth: 270, tileWidth: 84, spacing: 8, chipWidth: 44, count: 3),
            3
        )
    }

    func test_capacity_notEvenOneTile_isZero() {
        XCTAssertEqual(
            CallEffectsCompanionRule.capacity(availableWidth: 60, tileWidth: 84, spacing: 8, chipWidth: 44, count: 4),
            0
        )
    }

    // MARK: - Quelle taille

    func test_tileSize_singleCompanion_usesThePiPSize() {
        XCTAssertEqual(CallEffectsCompanionRule.tileSize(companionCount: 1, freeHeight: 400), CallSelfTileScale.standard.size)
    }

    func test_tileSize_group_usesTheFilmstripSize() {
        XCTAssertEqual(CallEffectsCompanionRule.tileSize(companionCount: 4, freeHeight: 400), CGSize(width: 84, height: 112))
    }

    func test_tileSize_shortBand_usesSmallTile() {
        XCTAssertEqual(CallEffectsCompanionRule.tileSize(companionCount: 4, freeHeight: 105), CallSelfTileScale.x1.size)
    }

    func test_tileSize_bandShorterThanATouchTarget_hasNoTile() {
        XCTAssertNil(CallEffectsCompanionRule.tileSize(companionCount: 4, freeHeight: 30))
    }

    // MARK: - Où il se range

    func test_corner_dropLeftOfCentre_snapsLeading() {
        XCTAssertEqual(CallEffectsCompanionRule.corner(dropX: 150, containerWidth: 390), .topLeading)
    }

    func test_corner_dropRightOfCentre_snapsTrailing() {
        XCTAssertEqual(CallEffectsCompanionRule.corner(dropX: 240, containerWidth: 390), .topTrailing)
    }

    func test_corner_rightToLeft_mirrorsTheSides() {
        XCTAssertEqual(CallEffectsCompanionRule.corner(dropX: 150, containerWidth: 390, isRightToLeft: true), .topTrailing)
        XCTAssertEqual(CallEffectsCompanionRule.corner(dropX: 240, containerWidth: 390, isRightToLeft: true), .topLeading)
    }

    func test_restingCenterX_leadingCorner_hugsTheLeftEdgeLeftToRight() {
        XCTAssertEqual(
            CallEffectsCompanionRule.restingCenterX(.topLeading, blockWidth: 100, containerWidth: 390, margin: 16, isRightToLeft: false),
            66
        )
    }

    func test_restingCenterX_leadingCorner_hugsTheRightEdgeRightToLeft() {
        XCTAssertEqual(
            CallEffectsCompanionRule.restingCenterX(.topLeading, blockWidth: 100, containerWidth: 390, margin: 16, isRightToLeft: true),
            324
        )
    }

    func test_corner_dragBackToWhereItStarted_keepsTheCorner() {
        let rest = CallEffectsCompanionRule.restingCenterX(.topTrailing, blockWidth: 100, containerWidth: 390, margin: 16, isRightToLeft: false)

        XCTAssertEqual(CallEffectsCompanionRule.corner(dropX: rest, containerWidth: 390), .topTrailing)
    }

    func test_corner_other_swapsTheSide() {
        XCTAssertEqual(CallEffectsCompanionCorner.topLeading.other, .topTrailing)
        XCTAssertEqual(CallEffectsCompanionCorner.topTrailing.other, .topLeading)
    }

    // MARK: - Le duo

    func test_duoTiles_remoteCameraOff_showsAvatar() {
        let remote = duoTiles(isRemoteVideoOn: false).first { !$0.isLocal }

        XCTAssertEqual(remote?.showsVideo, false)
        XCTAssertEqual(remote?.avatarURL, "https://cdn/bob.jpg")
        XCTAssertEqual(remote?.colorKey, "bob")
        XCTAssertEqual(remote?.isMicMuted, true)
    }

    func test_duoTiles_remoteWithoutId_stillHasAStableTile() {
        let tiles = CallEffectsCompanionRule.duoTiles(
            local: CallEffectsDuoPeer(userId: "me", name: "Vous", avatarURL: nil, isVideoOn: true, isMicMuted: false),
            remote: CallEffectsDuoPeer(userId: nil, name: "", avatarURL: nil, isVideoOn: false, isMicMuted: false)
        )

        XCTAssertEqual(tiles.map { $0.id }, [GroupCallStage.localTileId, CallEffectsCompanionRule.duoRemoteTileId])
    }
}
