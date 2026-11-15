import XCTest
@testable import Meeshy

/// #8578 — l'écran d'appel n'active qu'UNE chose à la fois : la scène seule,
/// le menu du (…), un panneau qui REMPLACE les rangées, ou un mode qui libère
/// tout l'écran. #8576 — les options caméra de l'image plein écran.
@MainActor
final class CallScreenLayerTests: XCTestCase {

    private func actions(
        isVideoEnabled: Bool = true,
        isConnected: Bool = true,
        hasSelectableCameras: Bool = false,
        isOnMac: Bool = false,
        showsVideo: Bool? = nil
    ) -> CallActionSet {
        CallActionSet.resolve(CallActionContext(
            isOnMac: isOnMac,
            isVideoEnabled: isVideoEnabled,
            hasSelectableCameras: hasSelectableCameras,
            isConnected: isConnected,
            mayRecord: true,
            showsVideo: showsVideo
        ))
    }

    // MARK: - Le (…)

    func test_togglingMenu_idle_opensTheMenu() {
        XCTAssertEqual(CallScreenLayer.idle.togglingMenu(), .menu)
    }

    func test_togglingMenu_menu_returnsToIdle() {
        XCTAssertEqual(CallScreenLayer.menu.togglingMenu(), .idle)
    }

    func test_togglingMenu_openPanel_closesEverything() {
        XCTAssertEqual(CallScreenLayer.panel(.react).togglingMenu(), .idle)
        XCTAssertEqual(CallScreenLayer.panel(.record).togglingMenu(), .idle)
    }

    /// #17343 — (…) sur un journal ouvert le RANGE : il ne ferme rien.
    func test_togglingMenu_openJournal_stowsItBehindTheMenu() {
        XCTAssertEqual(CallScreenLayer.panel(.journal).togglingMenu(), .menuOverJournal)
    }

    /// #17343 — refermer les actions rend le journal.
    func test_togglingMenu_menuOverJournal_givesTheJournalBack() {
        XCTAssertEqual(CallScreenLayer.menuOverJournal.togglingMenu(), .panel(.journal))
    }

    func test_menuOverJournal_isAMenu_theRailsAndRowsComeOut_nothingIsOpenYet() {
        let layer = CallScreenLayer.menuOverJournal
        XCTAssertTrue(layer.isExpanded)
        XCTAssertTrue(layer.showsFamilyRows)
        XCTAssertNil(layer.openPanel)
        XCTAssertNil(layer.pillPanel)
        XCTAssertTrue(layer.mayAutoHide)
        XCTAssertFalse(layer.freesTheScreen)
    }

    func test_opening_fromTheMenuOverAJournal_opensThePanelAsked() {
        XCTAssertEqual(CallScreenLayer.menuOverJournal.opening(.journal), .panel(.journal))
        XCTAssertEqual(CallScreenLayer.menuOverJournal.opening(.react), .panel(.react))
    }

    func test_backToMenu_menuOverJournal_changesNothing() {
        XCTAssertEqual(CallScreenLayer.menuOverJournal.backToMenu(), .menuOverJournal)
    }

    func test_closed_menuOverJournal_returnsToIdle() {
        XCTAssertEqual(CallScreenLayer.menuOverJournal.closed(), .idle)
    }

    func test_togglingMenu_mode_isIgnored() {
        XCTAssertEqual(CallScreenLayer.mode(.effects).togglingMenu(), .mode(.effects))
    }

    // MARK: - Un panneau remplace les rangées

    func test_opening_fromTheMenu_opensThePanel() {
        XCTAssertEqual(CallScreenLayer.menu.opening(.record), .panel(.record))
    }

    func test_opening_anotherPanel_replacesTheOpenOne() {
        XCTAssertEqual(CallScreenLayer.panel(.react).opening(.record), .panel(.record))
    }

    func test_opening_theOpenPanelAgain_returnsToTheMenu() {
        XCTAssertEqual(CallScreenLayer.panel(.react).opening(.react), .menu)
    }

    func test_opening_duringAMode_isIgnored() {
        XCTAssertEqual(CallScreenLayer.mode(.montage).opening(.journal), .mode(.montage))
    }

    func test_backToMenu_fromAPanel_returnsToTheMenu() {
        XCTAssertEqual(CallScreenLayer.panel(.people).backToMenu(), .menu)
    }

    func test_backToMenu_withoutAPanel_changesNothing() {
        XCTAssertEqual(CallScreenLayer.idle.backToMenu(), .idle)
        XCTAssertEqual(CallScreenLayer.mode(.effects).backToMenu(), .mode(.effects))
    }

    func test_closed_anyLayer_returnsToIdle() {
        let layers: [CallScreenLayer] = [.idle, .menu, .panel(.journal), .mode(.effects)]
        XCTAssertTrue(layers.allSatisfy { $0.closed() == .idle })
    }

    func test_pillPanel_reactRecordAndJournal_areDrawnInThePill_insteadOfTheRows() {
        XCTAssertEqual(CallScreenLayer.panel(.react).pillPanel, .react)
        XCTAssertEqual(CallScreenLayer.panel(.record).pillPanel, .record)
        XCTAssertEqual(CallScreenLayer.panel(.journal).pillPanel, .journal)
        XCTAssertFalse(CallScreenLayer.panel(.react).showsFamilyRows)
        XCTAssertFalse(CallScreenLayer.panel(.record).showsFamilyRows)
        XCTAssertFalse(CallScreenLayer.panel(.journal).showsFamilyRows)
    }

    /// #17343 — le journal n'est plus une feuille : il se dessine dans la pilule.
    /// Seul « Ajouter » (la liste d'amis) reste une feuille, sous les rangées.
    func test_pillPanel_people_staysASheetOverTheRows() {
        XCTAssertNil(CallScreenLayer.panel(.people).pillPanel)
        XCTAssertTrue(CallScreenLayer.panel(.people).showsFamilyRows)
    }

    /// Ma vignette reste pendant que le journal est ouvert : il ne libère pas l'écran.
    func test_openJournal_doesNotFreeTheScreen_myTileStays() {
        XCTAssertFalse(CallScreenLayer.panel(.journal).freesTheScreen)
        XCTAssertTrue(CallChromeVisibility(isModeActive: CallScreenLayer.panel(.journal).freesTheScreen).isVisible(.selfView))
    }

    func test_showsFamilyRows_onlyInTheMenuOrUnderASheet() {
        XCTAssertTrue(CallScreenLayer.menu.showsFamilyRows)
        XCTAssertFalse(CallScreenLayer.idle.showsFamilyRows)
        XCTAssertFalse(CallScreenLayer.mode(.effects).showsFamilyRows)
    }

    func test_panel_eachPointsAtItsOwnAction() {
        XCTAssertEqual(CallScreenPanel.allCases.map(\.action), [.react, .recording, .addPeople, .journal])
    }

    // MARK: - Un mode libère l'écran

    func test_entering_aMode_freesTheScreen() {
        let layer = CallScreenLayer.menu.entering(.effects)
        XCTAssertEqual(layer, .mode(.effects))
        XCTAssertTrue(layer.freesTheScreen)
        XCTAssertFalse(layer.isExpanded)
        XCTAssertNil(layer.openPanel)
    }

    func test_entering_anotherMode_replacesTheActiveOne() {
        XCTAssertEqual(CallScreenLayer.mode(.effects).entering(.montage), .mode(.montage))
    }

    func test_exitingMode_returnsToIdle() {
        XCTAssertEqual(CallScreenLayer.mode(.montage).exitingMode(), .idle)
    }

    func test_exitingMode_withoutAMode_changesNothing() {
        XCTAssertEqual(CallScreenLayer.panel(.react).exitingMode(), .panel(.react))
    }

    func test_mode_eachPointsAtItsEntryAction() {
        XCTAssertEqual(CallScreenMode.allCases.map(\.action), [.effects, .capture])
    }

    // MARK: - Masquage automatique

    func test_mayAutoHide_onlyOnTheSceneOrTheMenu() {
        XCTAssertTrue(CallScreenLayer.idle.mayAutoHide)
        XCTAssertTrue(CallScreenLayer.menu.mayAutoHide)
        XCTAssertFalse(CallScreenLayer.panel(.react).mayAutoHide)
        XCTAssertFalse(CallScreenLayer.mode(.effects).mayAutoHide)
    }

    // MARK: - Ce que l'appel ne permet plus

    func test_reconciled_modeWhoseActionVanished_returnsToIdle() {
        let audioOnly = actions(isVideoEnabled: false)
        XCTAssertEqual(CallScreenLayer.mode(.effects).reconciled(with: audioOnly), .idle)
    }

    func test_reconciled_montageWithoutVideo_returnsToIdle() {
        let noVideo = actions(isVideoEnabled: false, showsVideo: false)
        XCTAssertEqual(CallScreenLayer.mode(.montage).reconciled(with: noVideo), .idle)
    }

    func test_reconciled_panelWhoseActionVanished_returnsToTheMenu() {
        let notConnected = actions(isConnected: false)
        XCTAssertEqual(CallScreenLayer.panel(.react).reconciled(with: notConnected), .menu)
    }

    func test_reconciled_menuOverJournal_keepsTheLayer() {
        XCTAssertEqual(CallScreenLayer.menuOverJournal.reconciled(with: actions()), .menuOverJournal)
    }

    func test_reconciled_stillOffered_keepsTheLayer() {
        let video = actions()
        XCTAssertEqual(CallScreenLayer.mode(.montage).reconciled(with: video), .mode(.montage))
        XCTAssertEqual(CallScreenLayer.panel(.journal).reconciled(with: video), .panel(.journal))
    }

    // MARK: - Les options caméra (#8576)

    func test_myImage_videoOnPhone_cameraFlipEffectsScreen_inOrder() {
        XCTAssertEqual(actions().myImage, [.camera, .flipCamera, .effects, .screenShare])
    }

    func test_myImage_selectableCameras_offersThePicker() {
        XCTAssertEqual(actions(hasSelectableCameras: true).myImage, [.camera, .cameraPicker, .effects, .screenShare])
    }

    func test_myImage_onMac_offersCameraAndEffectsOnly() {
        XCTAssertEqual(actions(isOnMac: true).myImage, [.camera, .effects])
    }

    func test_myImage_neverOffersAnActionOfTheCall() {
        XCTAssertTrue(Set(actions().myImage).isDisjoint(with: Set(actions().theCall)))
    }

    func test_isMyImageFullScreen_duo_followsTheLocalPrimary() {
        XCTAssertTrue(CallCameraRail.isMyImageFullScreen(isGroupStage: false, isSelfFeatured: false, isLocalPrimary: true))
        XCTAssertFalse(CallCameraRail.isMyImageFullScreen(isGroupStage: false, isSelfFeatured: true, isLocalPrimary: false))
    }

    func test_isMyImageFullScreen_group_followsMyTileAtTheFront() {
        XCTAssertTrue(CallCameraRail.isMyImageFullScreen(isGroupStage: true, isSelfFeatured: true, isLocalPrimary: false))
        XCTAssertFalse(CallCameraRail.isMyImageFullScreen(isGroupStage: true, isSelfFeatured: false, isLocalPrimary: true))
    }

    // MARK: - G3.2 — la rangée de base d'une option ouverte n'est pas légendée

    func test_captionsBaseRow_anOptionDrawnInThePill_leavesTheBaseRowBare() {
        XCTAssertFalse(CallScreenLayer.panel(.record).captionsBaseRow)
        XCTAssertFalse(CallScreenLayer.panel(.react).captionsBaseRow)
        XCTAssertFalse(CallScreenLayer.panel(.journal).captionsBaseRow)
    }

    func test_captionsBaseRow_theMenuAndTheSheetOption_keepTheirCaptions() {
        XCTAssertTrue(CallScreenLayer.menu.captionsBaseRow)
        XCTAssertTrue(CallScreenLayer.menuOverJournal.captionsBaseRow)
        XCTAssertTrue(CallScreenLayer.panel(.people).captionsBaseRow)
    }

    // MARK: - #17964 — le journal dans la pilule se referme par « Journal » (P9b.3, P13.9)

    /// P9b.3 — journal ouvert, la rangée de base reste (…) · Micro · Sortie · Fin, (…) AU REPOS :
    /// le journal n'est pas une action du (…) dépliée. Le toucher le range (`menuOverJournal`),
    /// et là seulement (…) est actif.
    func test_openJournal_leavesTheMoreButtonAtRest() {
        XCTAssertFalse(CallScreenLayer.panel(.journal).isExpanded)
        XCTAssertTrue(CallScreenLayer.panel(.journal).togglingMenu().isExpanded)
    }

    func test_theMenuAndTheOtherOptions_stillExpandTheMoreButton() {
        let expanded: [CallScreenLayer] = [.menu, .menuOverJournal, .panel(.react), .panel(.record), .panel(.people)]
        XCTAssertTrue(expanded.allSatisfy(\.isExpanded))
        XCTAssertFalse(CallScreenLayer.idle.isExpanded)
    }

    /// G1 (#17964 point 4) — « Journal » des sous-titres OUVRE toujours : pilule rangée par un
    /// toucher sur un journal ouvert, il rend les contrôles AVEC le journal, jamais le menu.
    func test_opening_theOpenJournalAgain_keepsItOpen() {
        XCTAssertEqual(CallScreenLayer.panel(.journal).opening(.journal), .panel(.journal))
    }

    /// P13.9 — retoucher « Journal » (disque blanc, au pied du journal) le referme et rend ce qu'il
    /// remplaçait : les sous-titres s'ils étaient allumés, sinon la pilule de base.
    func test_closingTheJournal_givesBackTheCaptions_orTheBasePill() {
        let closed = CallScreenLayer.panel(.journal).closed()
        XCTAssertEqual(CallPillText.resolve(isCaptionsEnabled: true, layer: closed, isChromeRevealed: true), .captions)
        XCTAssertEqual(CallPillText.resolve(isCaptionsEnabled: false, layer: closed, isChromeRevealed: true), .none)
        XCTAssertFalse(closed.isExpanded)
    }

    /// Le pied du journal dit ce que ses phrases disent de leur traduction, comme celui des
    /// sous-titres ; le journal ne dessine aucune attente, son pied non plus.
    func test_journalFooter_saysThePair_andNeverAWaitingTranslation() {
        XCTAssertEqual(CallCaptionsFooter.journal(lines: [journalLine(origin: "EN", served: "FR")]), .touchForOriginal(pair: "EN → FR"))
        XCTAssertEqual(CallCaptionsFooter.journal(lines: [journalLine(origin: "EN", awaiting: true)]), .none)
        XCTAssertEqual(CallCaptionsFooter.journal(lines: []), .none)
    }

    /// P9b · P6 — au pied du journal, « Journal » en disque blanc plein (icône et texte sombres)
    /// le referme ; au pied des sous-titres, le même bouton, au repos, l'ouvre. Une seule pièce.
    func test_journalPanel_footerCarriesTheActiveJournalButton_whichCloses() throws {
        let views = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallCaptionsViews.swift"))
        let panel = try XCTUnwrap(views.range(of: "struct CallJournalPanel: View {"))
        let body = String(views[panel.upperBound...].prefix(3000))
        XCTAssertTrue(body.contains("CallJournalButton(isOpen: true, action: onClose)"), "« Journal » actif referme le journal")
        XCTAssertTrue(body.contains("CallCaptionsFooter.journal(lines:"), "le pied du journal garde sa légende")
        let band = try XCTUnwrap(views.range(of: "private func journalButton("))
        XCTAssertTrue(views[band.upperBound...].prefix(300).contains("CallJournalButton(isOpen: false, action: action)"))
        let chip = try XCTUnwrap(views.range(of: "struct CallJournalButton: View {"))
        let chipBody = String(views[chip.upperBound...].prefix(2000))
        XCTAssertTrue(chipBody.contains(".callChipGlass(isActive: isOpen, tint: .white)"), "ouvert, un disque blanc plein")
        XCTAssertTrue(chipBody.contains("MeeshyColors.indigo950"), "icône et texte sombres sur le blanc")
        XCTAssertTrue(chipBody.contains(".toggleStateAccessibility(isToggle: true, isActive: isOpen)"), "VoiceOver dit son état")
        XCTAssertTrue(chipBody.contains("minHeight: 44"))
    }

    private func journalLine(origin: String, served: String? = nil, awaiting: Bool = false) -> CallCaptionLine {
        var line = CallCaptionLine(
            id: UUID(), speakerId: "awa", speakerName: "Awa", text: "Salut",
            languageTag: served.map { "\(origin) → \($0)" } ?? origin,
            isFinal: true, capturedAt: Date(timeIntervalSince1970: 0),
            isShowingOriginal: served == nil, canRevealOriginal: served != nil
        )
        line.originLanguage = origin
        line.servedLanguage = served
        line.awaitingUntil = awaiting ? Date(timeIntervalSince1970: 8) : nil
        return line
    }
}
