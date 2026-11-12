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

    // MARK: - Mon image à la une (#8576)

    func test_featuresLocal_myTileAtTheFront_isTrue() {
        XCTAssertTrue(GroupCallSpotlight.featuresLocal(.spotlight(tileId: GroupCallStage.localTileId, isScreenShare: false)))
    }

    func test_featuresLocal_gridOrAMember_isFalse() {
        XCTAssertFalse(GroupCallSpotlight.featuresLocal(.grid))
        XCTAssertFalse(GroupCallSpotlight.featuresLocal(.spotlight(tileId: "b", isScreenShare: false)))
    }

    func test_featuresLocal_tappingMyTile_putsMyImageAtTheFront() {
        let focus = GroupCallSpotlight.focus(tiles: tiles(), choice: .tile(GroupCallStage.localTileId))
        XCTAssertTrue(GroupCallSpotlight.featuresLocal(focus))
    }

    // MARK: - U2.5 — la puce « Écran de X · 2× »

    func test_displayedZoom_isNilAtOne_andOtherwiseRoundedToTenths() {
        XCTAssertNil(GroupCallSpotlight.displayedZoom(1))
        XCTAssertNil(GroupCallSpotlight.displayedZoom(1.04), "1,04× s'affiche 1× : pas de suffixe")
        XCTAssertEqual(GroupCallSpotlight.displayedZoom(2), 2)
        XCTAssertEqual(GroupCallSpotlight.displayedZoom(2.46), 2.5)
        XCTAssertEqual(GroupCallSpotlight.displayedZoom(9), GroupCallSpotlight.maxZoom, "jamais au-delà du plafond")
    }

    func test_featuredChipText_carriesTheZoomFactor_afterTheTitle() {
        let fr = Locale(identifier: "fr_FR")
        XCTAssertEqual(GroupCallSpotlight.featuredChipText(title: "Écran de Karim", zoom: 2, locale: fr), "Écran de Karim · 2×")
        XCTAssertEqual(GroupCallSpotlight.featuredChipText(title: "Écran de Karim", zoom: 2.5, locale: fr), "Écran de Karim · 2,5×")
    }

    func test_featuredChipText_atOneTimes_isTheTitleAlone() {
        XCTAssertEqual(GroupCallSpotlight.featuredChipText(title: "Écran de Karim", zoom: 1, locale: Locale(identifier: "fr_FR")), "Écran de Karim")
    }

    func test_stage_putsTheScreenChipTopLeading_inGlass_andKeepsTheNameplateForThePerson() throws {
        let stage = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/GroupCallStageView.swift"))
        let featured = try XCTUnwrap(DeclarationBodyScanner.body(containing: "private func featuredTile(", in: stage))
        XCTAssertTrue(featured.contains(".overlay(alignment: .topLeading)"), "la puce est en haut à gauche")
        XCTAssertTrue(featured.contains("CallScreenShareChip("))
        XCTAssertTrue(featured.contains("GroupCallSpotlight.featuredChipText(title:"), "le facteur de zoom vient de la loi pure")
        XCTAssertTrue(featured.contains("zoom * pinch"), "la puce suit le pincement en direct")
        let tile = try XCTUnwrap(DeclarationBodyScanner.body(containing: "struct GroupCallTileView: View", in: stage))
        XCTAssertFalse(tile.contains("title ?? tile.displayName"), "« Écran de X » ne remplace plus le nom sur la plaque : il est sur la puce")
        let chrome = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallTileChrome.swift"))
        let chip = try XCTUnwrap(DeclarationBodyScanner.body(containing: "struct CallScreenShareChip: View", in: chrome))
        XCTAssertTrue(chip.contains(".callChromeGlass(in: Capsule())"), "le verre adaptatif, jamais un matériau posé à côté")
        XCTAssertTrue(chip.contains(".allowsHitTesting(false)"), "la puce ne prend aucun toucher : le pincement la traverse")
    }

    // MARK: - P14.10 — le mouvement grille ↔ à la une

    func test_motion_movesTheTiles_unlessReduceMotion() {
        XCTAssertTrue(GroupCallStageMotion.movesTiles(reduceMotion: false))
        XCTAssertFalse(GroupCallStageMotion.movesTiles(reduceMotion: true), "Réduire les animations ne déplace rien : un fondu court")
    }

    func test_motion_followsTheSharedFade_underReduceMotion() {
        XCTAssertEqual(GroupCallStageMotion.fadeDuration, CallRemoteVideoFade.duration(reduceMotion: true))
        XCTAssertGreaterThan(GroupCallStageMotion.fadeDuration, 0, "jamais une bascule sèche")
    }

    func test_stage_growsTheChosenTileFromItsCell_andSlidesTheOthersToTheStrip() throws {
        let stage = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/GroupCallStageView.swift"))
        XCTAssertTrue(stage.contains("@Namespace private var tileSpace"))
        XCTAssertTrue(stage.contains(".matchedGeometryEffect(id: tile.id, in: tileSpace)"), "une identité par personne, la même dans la grille, à la une et dans le bandeau")
        XCTAssertTrue(stage.contains("GroupCallStageMotion.movesTiles(reduceMotion: reduceMotion)"))
        XCTAssertTrue(stage.contains("value: focus"), "le mouvement suit aussi une mise à la une automatique (partage d'écran)")
        let choose = try XCTUnwrap(DeclarationBodyScanner.body(containing: "private func choose(", in: stage))
        XCTAssertTrue(choose.contains("withAnimation(stageAnimation)"))
        XCTAssertFalse(choose.contains("reduceMotion ? nil"), "Réduire les animations donne un fondu court, jamais une bascule sèche")
    }

    // MARK: - P11.5 / P14.4 — qui parle s'illumine de sa couleur

    func test_tile_speakerHalo_wearsThePersonsColour_fadesWithTheSharedDuration_andLeavesTheTreeNever() throws {
        let stage = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/GroupCallStageView.swift"))
        let tile = try XCTUnwrap(DeclarationBodyScanner.body(containing: "struct GroupCallTileView: View", in: stage))
        XCTAssertTrue(tile.contains("CallPeerSpeech.colorHex(forPeer: tile.colorKey)"), "la couleur de la personne, la même que ses sous-titres")
        XCTAssertTrue(tile.contains(".modifier(CallSpeakerHalo("), "le halo du duo, la même loi, jamais une copie")
        XCTAssertTrue(tile.contains("isSpeaking: tile.isSpeaking"), "le halo existe en opacité 0 au repos")
        XCTAssertFalse(tile.contains(".blur("), "aucun halo dessiné à la main dans la vignette")
        XCTAssertTrue(tile.contains("CallRemoteVideoFade.duration(reduceMotion: reduceMotion)"))
        XCTAssertTrue(tile.contains("value: tile.isSpeaking"))
        XCTAssertFalse(tile.contains("animation(reduceMotion ? nil"), "sous Réduire les animations, un fondu court")
    }

    // MARK: - P12.8 / P14.9 — une rangée qui défile s'efface à ses deux bords

    func test_pillRow_andFilmstrip_fadeAtBothEdges_withTheAppsOneMask() throws {
        let row = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallPillRow.swift"))
        XCTAssertTrue(row.contains(".mask { ScrollEdgeFadeMask(axis: .horizontal, start: true, end: true) }"))
        XCTAssertFalse(row.contains("EdgeFadeMask: View"), "le masque des rangées qui défilent existe déjà : il se réutilise, il ne se recopie pas")
        let stage = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/GroupCallStageView.swift"))
        let strip = try XCTUnwrap(DeclarationBodyScanner.body(containing: "private func filmstrip(", in: stage))
        XCTAssertTrue(strip.contains(".mask { ScrollEdgeFadeMask(axis: axis, start: true, end: true) }"), "portrait à l'horizontale, paysage à la verticale")
    }

    func test_edgeFadeMask_followsTheScreensEdges_sameInRightToLeft() throws {
        let cue = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Composer/ComposerScrollEdgeCue.swift"))
        let mask = try XCTUnwrap(DeclarationBodyScanner.body(containing: "struct ScrollEdgeFadeMask: View", in: cue))
        XCTAssertTrue(mask.contains(".environment(\\.layoutDirection, .leftToRight)"),
                      "en droite à gauche, la pile retournerait l'ordre des rampes sans retourner leurs dégradés")
        XCTAssertEqual(mask.components(separatedBy: "ramp(from:").count - 1, 3, "une déclaration et deux rampes, opposées")
        XCTAssertTrue(mask.contains(".allowsHitTesting(false)"), "le fondu ne prend aucun toucher")
        XCTAssertTrue(cue.contains("ScrollEdgeFadeMask(axis: .vertical, start: edges.top, end: edges.bottom"), "le rail du composer garde son fondu")
    }
}
