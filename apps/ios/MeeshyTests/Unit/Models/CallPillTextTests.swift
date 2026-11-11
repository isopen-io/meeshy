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

    private func line(tag: String? = nil, isEvent: Bool = false) -> CallCaptionLine {
        CallCaptionLine(
            id: UUID(), speakerId: "u", speakerName: "Awa", text: "Salut",
            languageTag: tag, isFinal: true, capturedAt: Date(timeIntervalSince1970: 0),
            isShowingOriginal: tag == nil, canRevealOriginal: tag != nil, isEvent: isEvent
        )
    }

    func test_aTranslatedLine_tellsHowToSeeTheOriginal() {
        XCTAssertEqual(CallCaptionsFooter.resolve(lines: [line(tag: "EN → FR")]), .touchForOriginal(pair: "EN → FR"))
    }

    func test_theNewestTranslatedLine_decidesThePair() {
        let lines = [line(tag: "ES → FR"), line(tag: "EN → FR"), line()]
        XCTAssertEqual(CallCaptionsFooter.resolve(lines: lines), .touchForOriginal(pair: "EN → FR"))
    }

    func test_originalsOnly_sayNothing() {
        XCTAssertEqual(CallCaptionsFooter.resolve(lines: [line(), line()]), .none)
    }

    func test_noLine_saysNothing() {
        XCTAssertEqual(CallCaptionsFooter.resolve(lines: []), .none)
    }

    func test_aCaptureEvent_isNotASpeech_itNeverSpeaksForTheFooter() {
        XCTAssertEqual(CallCaptionsFooter.resolve(lines: [line(tag: "EN → FR", isEvent: true)]), .none)
    }
}
