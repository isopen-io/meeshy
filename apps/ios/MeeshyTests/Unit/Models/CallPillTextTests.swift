import XCTest
@testable import Meeshy

/// #17343 — les sous-titres et le journal vivent DANS la pilule, au-dessus de sa
/// rangée de base, dans le même verre, en duo comme en groupe. (…) les range,
/// refermer les actions les rend, et la pilule rangée laisse les sous-titres dans
/// un verre sans rangée (loi 11). Ces témoins éprouvent la loi pure ; la vue ne fait
/// que la dessiner.
@MainActor
final class CallPillTextTests: XCTestCase {

    private func text(
        captions: Bool = true,
        _ layer: CallScreenLayer = .idle,
        revealed: Bool = true
    ) -> CallPillText {
        CallPillText.resolve(isCaptionsEnabled: captions, layer: layer, isChromeRevealed: revealed)
    }

    // MARK: - Les sous-titres dans la pilule

    func test_captionsOn_atRest_liveInThePill() {
        XCTAssertEqual(text(), .captions)
    }

    func test_captionsOff_atRest_thePillCarriesNoText() {
        XCTAssertEqual(text(captions: false), .none)
    }

    // MARK: - (…) les range, refermer les rend

    func test_openMenu_stowsTheCaptions() {
        XCTAssertEqual(text(.menu), .none)
        XCTAssertEqual(text(.menuOverJournal), .none)
    }

    func test_closingTheMenu_givesTheCaptionsBack() {
        XCTAssertEqual(text(CallScreenLayer.menu.togglingMenu()), .captions)
    }

    func test_anOptionOpenInThePill_replacesTheCaptions() {
        XCTAssertEqual(text(.panel(.react)), .none)
        XCTAssertEqual(text(.panel(.record)), .none)
    }

    // MARK: - U2.9 — le plein écran de groupe garde les sous-titres

    func test_fullScreenStage_keepsThePillOnlyWhenItCarriesTheCaptionsAlone() {
        XCTAssertTrue(CallPillText.captionsAlone.isOnStage(isStageFullScreen: true), "les sous-titres allumés survivent au plein écran, dans leur verre sans rangée")
        XCTAssertFalse(CallPillText.none.isOnStage(isStageFullScreen: true), "sans sous-titres, le plein écran ne garde aucun verre")
        XCTAssertFalse(CallPillText.captions.isOnStage(isStageFullScreen: true), "la pilule avec sa rangée de base est rangée")
        XCTAssertFalse(CallPillText.journal.isOnStage(isStageFullScreen: true))
    }

    func test_stageNotFullScreen_alwaysKeepsThePill() {
        for content in [CallPillText.none, .captions, .journal, .captionsAlone] {
            XCTAssertTrue(content.isOnStage(isStageFullScreen: false))
        }
    }

    func test_fullScreen_withCaptionsOn_resolvesToTheCaptionsAlone() {
        XCTAssertEqual(text(captions: true, .idle, revealed: false), .captionsAlone)
        XCTAssertTrue(text(captions: true, .idle, revealed: false).isOnStage(isStageFullScreen: true))
        XCTAssertFalse(text(captions: false, .idle, revealed: false).isOnStage(isStageFullScreen: true))
    }

    // MARK: - Le journal, à la place des sous-titres

    func test_openJournal_takesThePlaceOfTheCaptions() {
        XCTAssertEqual(text(.panel(.journal)), .journal)
    }

    /// #17342 — le journal garde tout l'appel, sous-titres allumés ou non : il s'ouvre aussi sans eux.
    func test_openJournal_withCaptionsOff_isStillThere() {
        XCTAssertEqual(text(captions: false, .panel(.journal)), .journal)
    }

    func test_stowedJournal_comesBackWhenTheMenuCloses() {
        let stowed = CallScreenLayer.panel(.journal).togglingMenu()
        XCTAssertEqual(text(stowed), .none)
        XCTAssertEqual(text(stowed.togglingMenu()), .journal)
    }

    // MARK: - Un toucher range la pilule : les sous-titres restent, sans rangée (loi 11)

    func test_stowedPill_keepsTheCaptions_inAGlassWithoutItsBaseRow() {
        XCTAssertEqual(text(revealed: false), .captionsAlone)
    }

    func test_stowedPill_withOpenMenuOrJournal_stillLeavesTheCaptions() {
        XCTAssertEqual(text(.menu, revealed: false), .captionsAlone)
        XCTAssertEqual(text(.panel(.journal), revealed: false), .captionsAlone)
    }

    func test_stowedPill_withCaptionsOff_hasNothingToLeave() {
        XCTAssertEqual(text(captions: false, revealed: false), .none)
        XCTAssertEqual(text(captions: false, .panel(.journal), revealed: false), .none)
    }

    /// Effets et Montage ont leur propre bande : la pilule ne porte rien.
    func test_aMode_hasItsOwnBand_thePillCarriesNoText() {
        XCTAssertEqual(text(.mode(.effects)), .none)
        XCTAssertEqual(text(.mode(.montage), revealed: false), .none)
    }

    func test_onlyTheCaptionsAloneLeaveTheBaseRowOut() {
        XCTAssertFalse(CallPillText.captionsAlone.hasBaseRow)
        XCTAssertTrue([CallPillText.none, .captions, .journal].allSatisfy(\.hasBaseRow))
    }

    /// G1.3 · G1.11 — UN seul verre : la pilule rangée reste à l'écran avec ses sous-titres
    /// (elle ne s'efface pas), sa rangée de base se retire par morphisme et le verre se resserre.
    func test_onlyTheCaptionsAlone_staysOnScreenWhenTheChromeIsStowed() {
        XCTAssertTrue(CallPillText.captionsAlone.staysWhenChromeStowed)
        XCTAssertTrue([CallPillText.none, .captions, .journal].allSatisfy { !$0.staysWhenChromeStowed })
    }

    func test_captionsBand_isInTheGlass_forCaptionsAndForTheStowedCaptions() {
        XCTAssertTrue(CallPillText.captions.showsCaptionsBand)
        XCTAssertTrue(CallPillText.captionsAlone.showsCaptionsBand)
        XCTAssertFalse(CallPillText.none.showsCaptionsBand)
        XCTAssertFalse(CallPillText.journal.showsCaptionsBand)
    }

    func test_stowedPill_withCaptions_isTheSameGlassWithoutItsRows_atEveryLayer() {
        for layer in [CallScreenLayer.idle, .menu, .panel(.journal), .menuOverJournal] {
            let stowed = text(layer, revealed: false)
            XCTAssertTrue(stowed.staysWhenChromeStowed, "\(layer) : un seul verre, jamais un second")
            XCTAssertFalse(stowed.hasBaseRow, "\(layer) : la rangée de base se retire")
        }
    }

    /// En audio, seul le journal ouvert resserre l'avatar en en-tête compact : deux
    /// phrases de sous-titres laissent la personne au centre.
    func test_onlyTheOpenJournal_compactsTheAudioLayout() {
        XCTAssertTrue(text(.panel(.journal)).compactsAudioLayout)
        XCTAssertFalse(text().compactsAudioLayout)
        XCTAssertFalse(text(.menuOverJournal).compactsAudioLayout)
        XCTAssertFalse(text(.panel(.journal), revealed: false).compactsAudioLayout)
    }

    // MARK: - Une seule largeur pour le verre

    func test_width_aPillThatCarriesText_andTheStowedGlass_shareOneCap() {
        XCTAssertEqual(CallPillWidth.maxWidth(for: .captions), 560)
        XCTAssertEqual(CallPillWidth.maxWidth(for: .journal), 560)
        XCTAssertEqual(CallPillWidth.maxWidth(for: .captionsAlone), 560)
    }

    func test_width_theRestingPill_keepsItsPortraitCap() {
        XCTAssertEqual(CallPillWidth.maxWidth(for: .none), 440)
        XCTAssertEqual(CallRailsLayout.pillMaxWidth, 440)
    }

    // MARK: - La hauteur du journal

    func test_journalHeight_isAShareOfTheWindow_neverBelowAReadableMinimum() {
        XCTAssertEqual(CallJournalSizing.height(windowHeight: 844), 844 * 0.45, accuracy: 0.001)
        XCTAssertEqual(CallJournalSizing.height(windowHeight: 320), CallJournalSizing.minimum)
    }

    func test_journalHeight_neverExceedsTheMaximum_onATallScreen() {
        XCTAssertEqual(CallJournalSizing.height(windowHeight: 1366), CallJournalSizing.maximum)
    }

    func test_journalHeight_withoutAWindow_isTheMinimum() {
        XCTAssertEqual(CallJournalSizing.height(windowHeight: 0), CallJournalSizing.minimum)
    }
}

/// #17343 — le pied des sous-titres : ce que la ligne dit de la traduction, à côté du bouton Journal.
@MainActor
final class CallCaptionsFooterTests: XCTestCase {

    private func line(
        origin: String? = nil,
        served: String? = nil,
        awaiting: Bool = false,
        isEvent: Bool = false
    ) -> CallCaptionLine {
        var sut = CallCaptionLine(
            id: UUID(), speakerId: "u", speakerName: "Awa", text: "Salut",
            languageTag: origin.map { o in served.map { "\(o) → \($0)" } ?? o },
            isFinal: true, capturedAt: Date(timeIntervalSince1970: 0),
            isShowingOriginal: served == nil, canRevealOriginal: served != nil, isEvent: isEvent
        )
        sut.originLanguage = origin
        sut.servedLanguage = served
        sut.awaitingUntil = awaiting ? Date(timeIntervalSince1970: 8) : nil
        return sut
    }

    func test_aTranslatedLine_tellsHowToSeeTheOriginal() {
        XCTAssertEqual(CallCaptionsFooter.resolve(lines: [line(origin: "EN", served: "FR")]), .touchForOriginal(pair: "EN → FR"))
    }

    func test_aLineAwaitingItsTranslation_saysSo() {
        XCTAssertEqual(CallCaptionsFooter.resolve(lines: [line(origin: "EN", awaiting: true)]), .translating(language: "EN"))
    }

    func test_waitingComesBeforeThePair_theNewestWaitingLineNamesItsLanguage() {
        let lines = [line(origin: "ES", served: "FR"), line(origin: "EN", awaiting: true), line(origin: "EN")]
        XCTAssertEqual(CallCaptionsFooter.resolve(lines: lines), .translating(language: "EN"))
    }

    func test_severalPairs_sayHowManyLanguagesAreTranslated() {
        let lines = [line(origin: "EN", served: "FR"), line(origin: "ES", served: "FR"), line()]
        XCTAssertEqual(CallCaptionsFooter.resolve(lines: lines), .translatedLanguages(count: 3))
    }

    func test_theSamePairTwice_isStillOnePair() {
        let lines = [line(origin: "EN", served: "FR"), line(origin: "EN", served: "FR")]
        XCTAssertEqual(CallCaptionsFooter.resolve(lines: lines), .touchForOriginal(pair: "EN → FR"))
    }

    func test_originalsOnly_sayNothing() {
        XCTAssertEqual(CallCaptionsFooter.resolve(lines: [line(), line(origin: "EN")]), .none)
    }

    func test_noLine_saysNothing() {
        XCTAssertEqual(CallCaptionsFooter.resolve(lines: []), .none)
    }

    func test_aCaptureEvent_isNotASpeech_itNeverSpeaksForTheFooter() {
        XCTAssertEqual(CallCaptionsFooter.resolve(lines: [line(origin: "EN", served: "FR", isEvent: true)]), .none)
    }
}
