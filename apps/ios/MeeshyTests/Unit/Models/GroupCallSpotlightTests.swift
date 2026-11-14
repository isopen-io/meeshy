import SwiftUI
import XCTest
import MeeshySDK
import MeeshyUI
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

    /// #18180 — évolue : la vignette épinglée ne survit plus qu'à la FIN d'un partage.
    func test_choice_pinnedTile_survivesTheEndOfTheShare() {
        XCTAssertEqual(GroupCallSpotlight.choice(.tile("b"), afterSharerChangedFrom: "c", to: nil), .tile("b"))
    }

    /// #18180 (loi 15) — Lina mise à la une à la main, Karim commence à partager : son écran prend la une.
    /// Mêmes vecteurs qu'Android (`GroupCallSpotlightTest`, #18248).
    func test_choice_aShareThatBegins_takesTheSpotlight_evenAfterAManualChoice() {
        XCTAssertNil(GroupCallSpotlight.choice(.tile("lina"), afterSharerChangedFrom: nil, to: "karim"))
        XCTAssertNil(GroupCallSpotlight.choice(.tile("lina"), afterSharerChangedFrom: "alice", to: "karim"))
        XCTAssertEqual(GroupCallSpotlight.choice(.tile("lina"), afterSharerChangedFrom: "karim", to: "karim"), .tile("lina"))
        XCTAssertNil(GroupCallSpotlight.choice(.tile(GroupCallStage.localTileId), afterSharerChangedFrom: nil, to: "karim"))
        let during = tiles(sharing: "c")
        let after = GroupCallSpotlight.choice(.tile("d"), afterSharerChangedFrom: nil, to: GroupCallSpotlight.sharerId(in: during))
        XCTAssertEqual(GroupCallSpotlight.focus(tiles: during, choice: after), .spotlight(tileId: "c", isScreenShare: true))
    }

    /// #18180 — le lecteur d'écran annonce le partage qui commence, sauf si une bannière l'annonce déjà.
    func test_announcesShare_onceWhenAShareBegins_unlessABannerSaysIt() {
        XCTAssertTrue(GroupCallSpotlight.announcesShare(oldSharer: nil, newSharer: "karim", isAnnouncedByBanner: false))
        XCTAssertTrue(GroupCallSpotlight.announcesShare(oldSharer: "alice", newSharer: "karim", isAnnouncedByBanner: false))
        XCTAssertFalse(GroupCallSpotlight.announcesShare(oldSharer: nil, newSharer: "karim", isAnnouncedByBanner: true))
        XCTAssertFalse(GroupCallSpotlight.announcesShare(oldSharer: "karim", newSharer: "karim", isAnnouncedByBanner: false))
        XCTAssertFalse(GroupCallSpotlight.announcesShare(oldSharer: "karim", newSharer: nil, isAnnouncedByBanner: false))
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

    // MARK: - U2.10 — le bandeau des autres sort jusqu'au bord de l'écran (#17726)

    func test_stripTravel_portrait_landsTheStripTopOnTheBottomEdge() {
        let stage = CGRect(x: 12, y: 120, width: 366, height: 500)
        let window = CGSize(width: 390, height: 844)
        let travel = GroupCallStageMotion.stripTravel(toward: .bottom, stage: stage, window: window, stripExtent: 112, isRightToLeft: false)
        XCTAssertEqual(travel.width, 0)
        XCTAssertEqual(stage.maxY - 112 + travel.height, window.height, "le haut du bandeau franchit le bord bas : il ne s'arrête pas à la place de la pilule")
    }

    func test_stripTravel_landscape_leavesByTheRightEdge() {
        let stage = CGRect(x: 59, y: 20, width: 700, height: 340)
        let window = CGSize(width: 844, height: 390)
        let travel = GroupCallStageMotion.stripTravel(toward: .trailing, stage: stage, window: window, stripExtent: 128, isRightToLeft: false)
        XCTAssertEqual(travel.height, 0)
        XCTAssertEqual(stage.maxX - 128 + travel.width, window.width, "le bord gauche de la colonne franchit le bord droit de l'écran")
    }

    func test_stripTravel_landscapeRightToLeft_leavesByTheLeftEdge() {
        let stage = CGRect(x: 59, y: 20, width: 700, height: 340)
        let window = CGSize(width: 844, height: 390)
        let travel = GroupCallStageMotion.stripTravel(toward: .trailing, stage: stage, window: window, stripExtent: 128, isRightToLeft: true)
        XCTAssertEqual(travel.height, 0)
        XCTAssertEqual(stage.minX + 128 + travel.width, 0, "en droite à gauche, la colonne est à gauche et sort par le bord gauche")
    }

    func test_stripTravel_stageAtTheEdge_movesByTheStripOwnSize() {
        let stage = CGRect(x: 0, y: 0, width: 390, height: 844)
        let travel = GroupCallStageMotion.stripTravel(toward: .bottom, stage: stage, window: CGSize(width: 390, height: 844), stripExtent: 112, isRightToLeft: false)
        XCTAssertEqual(travel.height, 112)
    }

    func test_stripTravel_unmeasuredStage_stillLeavesTheScreen() {
        let window = CGSize(width: 390, height: 844)
        let travel = GroupCallStageMotion.stripTravel(toward: .bottom, stage: .null, window: window, stripExtent: 112, isRightToLeft: false)
        XCTAssertTrue(travel.height.isFinite)
        XCTAssertGreaterThanOrEqual(travel.height, window.height, "une scène pas encore mesurée ne retient pas le bandeau à l'écran")
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

    // MARK: - P15.11 — le zoom de l'écran reçu en duo (même loi que la une du groupe)

    func test_receivedScreenZoom_followsThePinch_clampedBetweenOneAndFour() {
        XCTAssertEqual(GroupCallSpotlight.receivedScreenZoom(committed: 1, pinch: 2.5, isReceivingScreen: true), 2.5, accuracy: 0.0001)
        XCTAssertEqual(GroupCallSpotlight.receivedScreenZoom(committed: 2, pinch: 3, isReceivingScreen: true), 4, accuracy: 0.0001)
        XCTAssertEqual(GroupCallSpotlight.receivedScreenZoom(committed: 1, pinch: 0.4, isReceivingScreen: true), 1, accuracy: 0.0001)
    }

    func test_receivedScreenZoom_withoutAReceivedScreen_isAlwaysOne() {
        XCTAssertEqual(GroupCallSpotlight.receivedScreenZoom(committed: 3, pinch: 1.5, isReceivingScreen: false), 1, accuracy: 0.0001)
    }

    func test_duoVideoLayout_zoomsTheReceivedScreen_withoutDelayingTheTapThatStowsTheChrome() throws {
        let connected = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallView+Connected.swift"))
        let layout = try XCTUnwrap(DeclarationBodyScanner.body(containing: "var videoCallLayout: some View", in: connected))
        XCTAssertTrue(layout.contains(".modifier(CallReceivedScreenZoom(isReceivingScreen: callManager.screenShare.isRemoteSharing))"))
        let zoom = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallReceivedScreenZoom.swift"))
        XCTAssertTrue(zoom.contains("MagnificationGesture()"))
        XCTAssertTrue(zoom.contains("GroupCallSpotlight.receivedScreenZoom("), "la loi du groupe, jamais une copie")
        XCTAssertTrue(zoom.contains("TapGesture(count: 2)"))
        XCTAssertTrue(zoom.contains(".simultaneousGesture(zoomGesture, including: isReceivingScreen ? .all : .subviews)"), "le pincement ne retarde pas le toucher simple, et hors partage reçu il n'est pas posé")
        XCTAssertTrue(zoom.contains(".highPriorityGesture(resetTap, including: isZoomed ? .all : .subviews)"), "zoomé, le double toucher l'emporte sur le toucher du chrome : il ne le range ni ne le rend")
        XCTAssertFalse(zoom.contains("simultaneousGesture(resetTap"), "un double toucher simultané faisait basculer le chrome deux fois")
        XCTAssertTrue(zoom.contains("private var isZoomed: Bool { zoom > 1 }"), "à 1×, aucun double toucher : le toucher simple n'attend rien")
        XCTAssertTrue(zoom.contains("reduceMotion ? CallChromeStow.reducedFadeDuration : 0.2"), "Réduire les animations : un fondu court")
        XCTAssertTrue(zoom.contains(".clipped()"), "l'image zoomée ne déborde pas sur l'en-tête")
    }

    // MARK: - P15.5 — le verre s'assombrit sur un écran reçu

    func test_glassTone_noReceivedScreen_keepsTheUsualGlass() {
        XCTAssertNil(CallGlassTone.resolve(showsReceivedScreen: false))
        XCTAssertNil(CallGlassTone.resolve(showsReceivedScreen: false, luminance: 0.9))
    }

    func test_glassTone_receivedScreen_isOnLightUntilALuminanceSaysOtherwise() {
        XCTAssertEqual(CallGlassTone.resolve(showsReceivedScreen: true), .onLight)
        XCTAssertEqual(CallGlassTone.resolve(showsReceivedScreen: true, luminance: 0.8), .onLight)
        XCTAssertEqual(CallGlassTone.resolve(showsReceivedScreen: true, luminance: 0.3), .deep)
    }

    func test_glassTone_veil_darkensOnlyOnLightContent_withTheSDKsOwnMeasure() {
        XCTAssertEqual(CallGlassTone.veilOpacity(tone: nil, resting: 0.22), 0.22, accuracy: 0.0001)
        XCTAssertEqual(CallGlassTone.veilOpacity(tone: .deep, resting: 0.22), 0.22, accuracy: 0.0001)
        let dark = CallGlassTone.veilOpacity(tone: .onLight, resting: 0.22)
        XCTAssertEqual(dark, MeeshyGlassRecipe.liquidWash(tone: .onLight) ?? -1, accuracy: 0.0001, "la mesure du SDK, jamais un second chiffre")
        XCTAssertGreaterThan(dark, 0.22)
    }

    func test_callGlass_everySurfaceOfTheCallTakesItsVeilFromTheTone() throws {
        let glass = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallControlGlass.swift"))
        let chromeGlass = try XCTUnwrap(DeclarationBodyScanner.body(containing: "func callChromeGlass<S: Shape>(", in: glass))
        let controlsGlass = try XCTUnwrap(DeclarationBodyScanner.body(containing: "func callControlsGlass<S: Shape>(", in: glass))
        let capsule = try XCTUnwrap(DeclarationBodyScanner.body(containing: "struct CallInteractiveChromeCapsule: ViewModifier", in: glass))
        XCTAssertTrue(chromeGlass.contains("CallGlassVeil(shape: shape"))
        XCTAssertTrue(controlsGlass.contains("CallGlassVeil(shape: shape"))
        XCTAssertTrue(capsule.contains("CallGlassVeil(shape: Capsule()"))
        XCTAssertFalse(glass.contains("Color.black.opacity(0.22)"), "plus de voile noir fixe")
        let header = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallView+Header.swift"))
        XCTAssertTrue(header.contains("CallGlassVeil(shape: Circle()"), "les boutons de l'en-tête s'assombrissent aussi")
        let root = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallView.swift"))
        XCTAssertTrue(root.contains(".environment(\\.callGlassTone, CallGlassTone.resolve(showsReceivedScreen:"), "le ton se pose une fois, à la racine de l'appel")
    }

    // MARK: - U2.2 · #17961 — deux niveaux de plein écran (vecteurs d'Android, #18248)

    func test_fullScreenLevel_risesOneLevelPerPress_aSharedScreenUpToTotal_aCameraOnlyOnce() {
        XCTAssertEqual(GroupCallSpotlight.raised(.off, isScreenShare: true), .fullScreen)
        XCTAssertEqual(GroupCallSpotlight.raised(.fullScreen, isScreenShare: true), .total)
        XCTAssertEqual(GroupCallSpotlight.raised(.total, isScreenShare: true), .total)
        XCTAssertEqual(GroupCallSpotlight.raised(.off, isScreenShare: false), .fullScreen)
        XCTAssertEqual(GroupCallSpotlight.raised(.fullScreen, isScreenShare: false), .fullScreen, "une caméra à la une n'a qu'un niveau")
        XCTAssertEqual(GroupCallSpotlight.lowered(.total), .fullScreen)
        XCTAssertEqual(GroupCallSpotlight.lowered(.fullScreen), .off)
        XCTAssertEqual(GroupCallSpotlight.lowered(.off), .off)
    }

    func test_fullScreenLevel_isReadFromTheChromeFullScreen_totalReservedToASharedScreen() {
        XCTAssertEqual(GroupCallSpotlight.fullScreenLevel(isFullScreen: false, wantsTotal: true, isScreenShare: true), .off)
        XCTAssertEqual(GroupCallSpotlight.fullScreenLevel(isFullScreen: true, wantsTotal: false, isScreenShare: true), .fullScreen)
        XCTAssertEqual(GroupCallSpotlight.fullScreenLevel(isFullScreen: true, wantsTotal: true, isScreenShare: true), .total)
        XCTAssertEqual(GroupCallSpotlight.fullScreenLevel(isFullScreen: true, wantsTotal: true, isScreenShare: false), .fullScreen)
        XCTAssertFalse(GroupCallFullScreenLevel.off.isFullScreen)
        XCTAssertTrue(GroupCallFullScreenLevel.fullScreen.isFullScreen)
        XCTAssertTrue(GroupCallFullScreenLevel.total.isFullScreen)
    }

    /// #17961 — le plein écran (U2) GARDE les caméras des autres ; seul le plein écran total (U2b) les retire.
    func test_fullScreenLevel_keepsTheOthersInFullScreen_andHidesThemOnlyInTotal() {
        XCTAssertFalse(GroupCallFullScreenLevel.off.hidesStrip)
        XCTAssertFalse(GroupCallFullScreenLevel.fullScreen.hidesStrip)
        XCTAssertTrue(GroupCallFullScreenLevel.total.hidesStrip)
    }

    /// U2 « Revenir à la grille · Plein écran total · Quitter le plein écran » ; U2b « Revenir à la grille · Quitter le plein écran total ».
    func test_capsuleButtons_offerGrid_thenTheNextLevel_thenTheWayDown() {
        XCTAssertEqual(GroupCallSpotlightButton.allCases.count, 5)
        XCTAssertEqual(GroupCallSpotlight.capsuleButtons(level: .off, isScreenShare: true), [.grid, .fullScreen])
        XCTAssertEqual(GroupCallSpotlight.capsuleButtons(level: .off, isScreenShare: false), [.grid, .fullScreen])
        XCTAssertEqual(GroupCallSpotlight.capsuleButtons(level: .fullScreen, isScreenShare: true), [.grid, .totalFullScreen, .exitFullScreen])
        XCTAssertEqual(GroupCallSpotlight.capsuleButtons(level: .fullScreen, isScreenShare: false), [.grid, .exitFullScreen])
        XCTAssertEqual(GroupCallSpotlight.capsuleButtons(level: .total, isScreenShare: true), [.grid, .exitTotalFullScreen])
    }

    func test_levelAfter_eachButtonMovesToItsLevel_gridLeavesEverything() {
        XCTAssertEqual(GroupCallSpotlight.level(after: .fullScreen, from: .off, isScreenShare: true), .fullScreen)
        XCTAssertEqual(GroupCallSpotlight.level(after: .totalFullScreen, from: .fullScreen, isScreenShare: true), .total)
        XCTAssertEqual(GroupCallSpotlight.level(after: .exitTotalFullScreen, from: .total, isScreenShare: true), .fullScreen)
        XCTAssertEqual(GroupCallSpotlight.level(after: .exitFullScreen, from: .fullScreen, isScreenShare: true), .off)
        XCTAssertEqual(GroupCallSpotlight.level(after: .grid, from: .total, isScreenShare: true), .off)
    }

    /// En plein écran, l'en-tête et la pilule sont rangés : le chrome qui se voit, c'est la capsule. Toucher une
    /// caméra du bandeau la met donc à la une tant que la capsule est là, et rend la capsule quand elle est rangée.
    func test_isChromeShown_inFullScreen_isTheCapsule() {
        XCTAssertTrue(GroupCallSpotlight.isChromeShown(isFullScreen: false, isControlsVisible: true, isCapsuleVisible: true))
        XCTAssertFalse(GroupCallSpotlight.isChromeShown(isFullScreen: false, isControlsVisible: false, isCapsuleVisible: true))
        XCTAssertTrue(GroupCallSpotlight.isChromeShown(isFullScreen: true, isControlsVisible: false, isCapsuleVisible: true))
        XCTAssertFalse(GroupCallSpotlight.isChromeShown(isFullScreen: true, isControlsVisible: false, isCapsuleVisible: false))
    }

    func test_stage_keepsTheStripInFullScreen_leavesItOnlyInTotal_andBuildsTheCapsuleFromTheLaw() throws {
        let stage = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/GroupCallStageView.swift"))
        let spotlight = try XCTUnwrap(DeclarationBodyScanner.body(containing: "private func spotlight(", in: stage))
        XCTAssertTrue(spotlight.contains("if !level.hidesStrip"), "le bandeau reste au plein écran, il ne sort qu'au plein écran total")
        XCTAssertFalse(spotlight.contains("if !isFullScreen"), "le plein écran ne retire plus les caméras des autres")
        let controls = try XCTUnwrap(DeclarationBodyScanner.body(containing: "private var spotlightControls: some View", in: stage))
        XCTAssertTrue(controls.contains("GroupCallSpotlight.capsuleButtons(level:"), "la capsule suit la loi pure, jamais une liste écrite dans la vue")
        XCTAssertFalse(controls.contains("isFullScreen.toggle()"), "un seul bouton qui bascule ne dit pas deux niveaux")
        XCTAssertTrue(stage.contains("GroupCallSpotlight.level(after:"), "chaque bouton mène à son niveau par la loi")
        XCTAssertTrue(stage.contains("GroupCallSpotlight.isChromeShown(isFullScreen:"), "en plein écran, le toucher d'une caméra du bandeau lit la capsule")
        XCTAssertTrue(stage.contains("\"call.group.fullscreen.total.enter\""))
        XCTAssertTrue(stage.contains("\"call.group.fullscreen.total.exit\""))
    }

    func test_totalFullScreenLabels_existInTheSevenLanguages() throws {
        let catalog = try AppSourceGuard.unit("Meeshy/Localizable.xcstrings")
        let data = try XCTUnwrap(catalog.data(using: .utf8))
        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        let strings = try XCTUnwrap(json["strings"] as? [String: Any])
        for key in ["call.group.fullscreen.total.enter", "call.group.fullscreen.total.exit"] {
            let entry = try XCTUnwrap(strings[key] as? [String: Any], key)
            let localizations = try XCTUnwrap(entry["localizations"] as? [String: Any], key)
            XCTAssertEqual(Set(localizations.keys), ["fr", "en", "es", "de", "it", "pt-BR", "ar"], key)
        }
    }

    // MARK: - U2.5 · #17961 point 1 — la puce se range avec la capsule

    func test_screenChip_stowsAndReturnsWithTheCapsule() throws {
        let stage = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/GroupCallStageView.swift"))
        let featured = try XCTUnwrap(DeclarationBodyScanner.body(containing: "private func featuredTile(", in: stage))
        let chip = try XCTUnwrap(featured.range(of: "CallScreenShareChip("))
        let afterChip = String(featured[chip.lowerBound...].prefix(700))
        XCTAssertTrue(afterChip.contains("CallEdgeStow(edge: .top"), "la puce sort par le haut avec la capsule")
        XCTAssertTrue(afterChip.contains(".callChromeVisibility(isCapsuleVisible)"), "la puce suit la visibilité de la capsule, aux deux niveaux")
    }

    // MARK: - U2.7 · #17753 — l'écran zoomé se déplace, borné à son cadre (vecteurs du web, #17747)

    func test_screenPan_atOneTimes_nothingMoves() {
        XCTAssertEqual(GroupCallSpotlight.screenPanClamp(GroupCallScreenPan(x: 50, y: -30), zoom: 1, width: 400, height: 200), GroupCallScreenPan(x: 0, y: 0))
    }

    func test_screenPan_zoomed_neverLeavesItsFrame() {
        XCTAssertEqual(GroupCallSpotlight.screenPanClamp(GroupCallScreenPan(x: 999, y: -999), zoom: 2, width: 400, height: 200), GroupCallScreenPan(x: 200, y: -100))
        XCTAssertEqual(GroupCallSpotlight.screenPanClamp(GroupCallScreenPan(x: 40, y: -20), zoom: 2, width: 400, height: 200), GroupCallScreenPan(x: 40, y: -20))
        XCTAssertEqual(GroupCallSpotlight.screenPanClamp(GroupCallScreenPan(x: 999, y: 999), zoom: GroupCallSpotlight.maxZoom, width: 400, height: 200), GroupCallScreenPan(x: 600, y: 300))
    }

    func test_screenPan_backTowardOneTimes_recentres() {
        XCTAssertEqual(GroupCallSpotlight.screenPanClamp(GroupCallScreenPan(x: 600, y: 300), zoom: 2, width: 400, height: 200), GroupCallScreenPan(x: 200, y: 100))
        XCTAssertEqual(GroupCallSpotlight.screenPanClamp(GroupCallScreenPan(x: 600, y: 300), zoom: 1, width: 400, height: 200), GroupCallScreenPan(x: 0, y: 0))
    }

    func test_screenPan_aDragAddsItsOffset_bounded() {
        XCTAssertEqual(GroupCallSpotlight.screenPanAfterDrag(GroupCallScreenPan(x: 10, y: 0), dx: 25, dy: -5, zoom: 2, width: 400, height: 200), GroupCallScreenPan(x: 35, y: -5))
        XCTAssertEqual(GroupCallSpotlight.screenPanAfterDrag(GroupCallScreenPan(x: 190, y: 0), dx: 50, dy: 0, zoom: 2, width: 400, height: 200), GroupCallScreenPan(x: 200, y: 0))
    }

    func test_screenPan_anUnmeasuredFrame_movesNothing() {
        XCTAssertEqual(GroupCallSpotlight.screenPanClamp(GroupCallScreenPan(x: 5, y: 5), zoom: 3, width: 0, height: 0), GroupCallScreenPan(x: 0, y: 0))
        XCTAssertEqual(GroupCallSpotlight.screenPanClamp(GroupCallScreenPan(x: 5, y: 5), zoom: 3, width: .nan, height: .infinity), GroupCallScreenPan(x: 0, y: 0))
    }

    /// Le déplacement affiché part de la position acquise RAMENÉE dans la borne du zoom vivant, puis ajoute le glissé.
    func test_screenPan_shown_startsFromTheBoundedAcquiredPan() {
        let size = CGSize(width: 400, height: 200)
        XCTAssertEqual(GroupCallSpotlight.screenPan(acquired: GroupCallScreenPan(x: 600, y: 0), drag: CGSize(width: -50, height: 0), zoom: 2, in: size), GroupCallScreenPan(x: 150, y: 0))
        XCTAssertEqual(GroupCallSpotlight.screenPan(acquired: .zero, drag: CGSize(width: 80, height: 80), zoom: 1, in: size), .zero)
    }

    func test_featuredScreen_andDuoScreen_panWithTheLaw_onTheGPU() throws {
        let stage = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/GroupCallStageView.swift"))
        XCTAssertTrue(stage.contains("GroupCallSpotlight.screenPan(acquired:"), "la une se déplace par la loi pure")
        XCTAssertTrue(stage.contains("DragGesture(minimumDistance: GroupCallSpotlight.panSlop"), "le déplacement ne commence qu'au-delà du seuil du toucher")
        let tile = try XCTUnwrap(DeclarationBodyScanner.body(containing: "struct GroupCallTileView: View", in: stage))
        XCTAssertTrue(tile.contains(".scaleEffect(zoom)\n                        .offset(x: pan.x, y: pan.y)"), "une transformation, jamais une mise en page")
        let zoom = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallReceivedScreenZoom.swift"))
        XCTAssertTrue(zoom.contains("GroupCallSpotlight.screenPan(acquired:"), "le duo suit la même loi")
        XCTAssertTrue(zoom.contains("DragGesture(minimumDistance: GroupCallSpotlight.panSlop"))
        XCTAssertTrue(zoom.contains("including: isZoomed ? .all : .subviews"), "à 1×, aucun glissé n'est posé : le toucher et le balayage vers le bas restent")
        XCTAssertTrue(zoom.contains("CallReceivedScreenZoomedKey"), "zoomé, l'écran garde le doigt : le balayage qui réduit l'appel n'en part pas")
        let connected = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallView+Connected.swift"))
        XCTAssertTrue(connected.contains(".modifier(CallSwipeDownGate(gesture: swipeDownToLeaveGesture))"))
        XCTAssertTrue(zoom.contains(".simultaneousGesture(gesture, including: isScreenZoomed ? .subviews : .all)"))
    }

    // MARK: - U2.6 · #16972 — le verre s'assombrit sur l'écran partagé à la une d'un groupe

    func test_glassDarkens_onAReceivedScreen_inDuo_andOnAScreenFeaturedInAGroup() {
        XCTAssertTrue(GroupCallSpotlight.showsReceivedScreen(isGroupStage: false, isRemoteSharing: true, focus: .grid))
        XCTAssertFalse(GroupCallSpotlight.showsReceivedScreen(isGroupStage: false, isRemoteSharing: false, focus: .grid))
        XCTAssertTrue(GroupCallSpotlight.showsReceivedScreen(isGroupStage: true, isRemoteSharing: false, focus: .spotlight(tileId: "c", isScreenShare: true)))
        XCTAssertFalse(GroupCallSpotlight.showsReceivedScreen(isGroupStage: true, isRemoteSharing: true, focus: .spotlight(tileId: "c", isScreenShare: false)), "une caméra à la une garde le verre de repos")
        XCTAssertFalse(GroupCallSpotlight.showsReceivedScreen(isGroupStage: true, isRemoteSharing: true, focus: .grid), "« Grille » pendant un partage : aucun écran ne tient la scène")
    }

    func test_callRoot_readsTheGroupFeaturedScreen_forTheGlassTone() throws {
        let root = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallView.swift"))
        XCTAssertTrue(root.contains("CallGlassTone.resolve(showsReceivedScreen: GroupCallSpotlight.showsReceivedScreen("), "le groupe n'est plus exclu du verre sombre")
        XCTAssertFalse(root.contains("showsReceivedScreen: !isGroupStage &&"))
        let connected = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallView+Connected.swift"))
        XCTAssertTrue(connected.contains("onFocusChange: { groupStageFocus = $0 }"), "la scène dit à la racine ce qui est à la une")
    }

    // MARK: - #18180 — le partage qui commence s'annonce

    func test_stage_announcesAShareThatBegins_toVoiceOver() throws {
        let stage = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/GroupCallStageView.swift"))
        XCTAssertTrue(stage.contains("GroupCallSpotlight.announcesShare(oldSharer:"))
        XCTAssertTrue(stage.contains("UIAccessibility.post(notification: .announcement, argument: CallScreenShareCopy.remoteBanner(name:"))
    }

    // MARK: - U1.14 · #18181 — le zoom de MA caméra à la une est permis (déjà tenu sur iOS)

    func test_featuredTile_keepsTheZoomOfMyOwnCamera() throws {
        let stage = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/GroupCallStageView.swift"))
        let featured = try XCTUnwrap(DeclarationBodyScanner.body(containing: "private func featuredTile(", in: stage))
        XCTAssertTrue(featured.contains(".callCameraZoom(isEnabled: tile.isLocal && tile.showsVideo)"), "#18181 : pincer ma vignette à la une zoome ma caméra")
    }

    // MARK: - loi 17.12 — la vignette fond entre l'image et l'avatar

    func test_tile_fadesBetweenImageAndAvatar_withTheSharedDuration() throws {
        let stage = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/GroupCallStageView.swift"))
        let tile = try XCTUnwrap(DeclarationBodyScanner.body(containing: "struct GroupCallTileView: View", in: stage))
        XCTAssertGreaterThanOrEqual(tile.components(separatedBy: ".transition(.opacity)").count - 1, 2, "l'image et l'avatar entrent et sortent en fondu")
        XCTAssertTrue(tile.contains("value: showsImage"), "le fondu suit la caméra qui se coupe ou se rallume")
        XCTAssertTrue(tile.contains("CallRemoteVideoFade.duration(reduceMotion: reduceMotion)"), "la durée du duo, courte sous Réduire les animations")
    }

    // MARK: - U1.11 — la grille ↔ la une garde les rendus vidéo

    func test_rendererPool_lendsTheSameRenderer_toTheNextHostOfTheSamePerson() {
        let pool = CallVideoRendererPool<UIView>()
        let first = pool.lend("karim") { UIView() }
        let second = pool.lend("karim") { UIView() }
        XCTAssertTrue(first === second, "la une reprend le rendu de la grille, elle ne le recrée pas")
        XCTAssertFalse(first === pool.lend("lina") { UIView() })
    }

    func test_rendererPool_keepsARendererAnotherHostHolds_andReleasesAnOrphan() {
        let pool = CallVideoRendererPool<UIView>()
        let renderer = pool.lend("karim") { UIView() }
        let grid = UIView()
        let spotlight = UIView()
        grid.addSubview(renderer)
        spotlight.addSubview(renderer)
        XCTAssertFalse(pool.isOrphaned("karim", leaving: grid), "la grille part, la une tient déjà le rendu : il reste")
        XCTAssertTrue(pool.isOrphaned("karim", leaving: spotlight), "le dernier hôte part : le rendu est libre")
        renderer.removeFromSuperview()
        XCTAssertTrue(pool.isOrphaned("karim", leaving: grid))
        XCTAssertTrue(pool.evict("karim") === renderer)
        XCTAssertNil(pool.evict("karim"))
        XCTAssertFalse(pool.isOrphaned("karim", leaving: grid), "un rendu rendu n'est plus à libérer")
    }

    func test_groupTiles_borrowTheirRenderer_byPerson() throws {
        let stage = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/GroupCallStageView.swift"))
        let tile = try XCTUnwrap(DeclarationBodyScanner.body(containing: "struct GroupCallTileView: View", in: stage))
        XCTAssertTrue(tile.contains("rendererKey: tile.id"), "une identité par personne, le même rendu dans la grille, à la une et dans le bandeau")
        let video = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/WebRTCVideoView.swift"))
        XCTAssertTrue(video.contains("struct PooledWebRTCVideoView: UIViewRepresentable"))
        XCTAssertTrue(video.contains("CallVideoRendererPool"))
    }
}
