import XCTest
@testable import Meeshy

/// #8579 — le journal de l'appel garde TOUTES les phrases, dans l'ordre de
/// capture, et ne saute jamais en bas pendant qu'on relit.
@MainActor
final class CallTranscriptJournalTests: XCTestCase {

    private func segment(_ text: String, at seconds: TimeInterval) -> Meeshy.CallTranscriptionSegment {
        Meeshy.CallTranscriptionSegment(
            id: UUID(),
            wireId: nil,
            text: text,
            speakerId: "peer",
            speakerDisplayName: nil,
            startTime: 0,
            endTime: 1,
            isFinal: true,
            confidence: 1,
            language: "fr",
            translatedText: nil,
            translatedLanguage: nil,
            capturedAt: Date(timeIntervalSince1970: seconds)
        )
    }

    private func metrics(offset: CGFloat, content: CGFloat = 2000, viewport: CGFloat = 400) -> CallJournalScrollMetrics {
        CallJournalScrollMetrics(offset: offset, contentHeight: content, viewportHeight: viewport)
    }

    // MARK: - Ordre et rétention

    func test_inserting_lateArrival_takesItsCapturePlace() {
        let sorted = [segment("a", at: 1), segment("c", at: 3)]
        XCTAssertEqual(CallTranscriptJournal.inserting(segment("b", at: 2), into: sorted).map(\.text), ["a", "b", "c"])
    }

    func test_inserting_sameInstant_keepsTheArrivalOrder() {
        let sorted = [segment("a", at: 1)]
        XCTAssertEqual(CallTranscriptJournal.inserting(segment("b", at: 1), into: sorted).map(\.text), ["a", "b"])
    }

    func test_inserting_intoAnEmptyJournal_startsIt() {
        XCTAssertEqual(CallTranscriptJournal.inserting(segment("a", at: 1), into: []).map(\.text), ["a"])
    }

    /// #17342, P6.8 — le journal garde TOUT l'appel : aucune phrase ne tombe, si
    /// longue que soit la conversation (plus de plafond de 10 000 phrases).
    func test_inserting_beyondTenThousandSentences_dropsNone() {
        let journal = (0 ..< 10_000).map { segment("\($0)", at: TimeInterval($0)) }
        let grown = CallTranscriptJournal.inserting(segment("dernière", at: 10_000), into: journal)
        XCTAssertEqual(grown.count, 10_001)
        XCTAssertEqual(grown.first?.text, "0", "la plus ancienne phrase reste")
        XCTAssertEqual(grown.last?.text, "dernière")
    }

    func test_journal_hasNoCeiling() throws {
        let law = try AppSourceGuard.unit("Meeshy/Features/Call/Models/CallTranscriptJournal.swift")
        XCTAssertFalse(law.contains("ceiling"), "Aucun plafond ne fait tomber les plus anciennes phrases (#17342)")
        XCTAssertFalse(law.contains("bounded"))
        let service = try AppSourceGuard.unit("Meeshy/Features/Call/Services/CallTranscriptionService.swift")
        XCTAssertFalse(service.contains("CallTranscriptJournal.bounded"))
        XCTAssertFalse(service.contains("persistedSegmentCeiling"), "Le journal d'après l'appel n'hérite d'aucun trou")
    }

    // MARK: - L'heure dans l'appel (P6.4)

    private let english = Locale(identifier: "en_US")

    func test_clock_isTheTimeSinceTheCallStarted() {
        let start = Date(timeIntervalSince1970: 1_000)
        XCTAssertEqual(CallJournalClock.label(at: start.addingTimeInterval(75), since: start, locale: english), "01:15")
        XCTAssertEqual(CallJournalClock.label(at: start, since: start, locale: english), "00:00")
    }

    func test_clock_aSentenceStampedBeforeTheCallStart_readsZero() {
        let start = Date(timeIntervalSince1970: 1_000)
        XCTAssertEqual(CallJournalClock.label(at: start.addingTimeInterval(-3), since: start, locale: english), "00:00")
    }

    func test_clock_withoutACallStart_saysNothingRatherThanTheWallClock() {
        XCTAssertNil(CallJournalClock.label(at: Date(timeIntervalSince1970: 1_000), since: nil, locale: english))
    }

    func test_composer_datesEverySpokenLineByItsTimeInTheCall() {
        let start = Date(timeIntervalSince1970: 1_000)
        let said = segment("Salut", at: 1_075)
        let composer = CallJournalComposer(
            segments: [said], captures: [], callStartedAt: start,
            speechLine: { [self] in captionLine($0.text) }
        )
        XCTAssertEqual(composer.line(for: .speech(said)).timeLabel, CallJournalClock.label(at: said.capturedAt, since: start))
        XCTAssertEqual(composer.line(for: .speech(said)).timeLabel, "01:15")
    }

    // MARK: - Relire sans être ramené en bas

    func test_scrolled_atTheBottom_followsTheLive() {
        let follow = CallJournalFollow(isFollowing: false, hasUnseen: true).scrolled(from: metrics(offset: 1000), to: metrics(offset: 1600))
        XCTAssertEqual(follow, .live)
    }

    func test_scrolled_upward_stopsFollowing() {
        let follow = CallJournalFollow.live.scrolled(from: metrics(offset: 1600), to: metrics(offset: 1200))
        XCTAssertFalse(follow.isFollowing)
        XCTAssertTrue(follow.showsReturnToLive)
    }

    func test_scrolled_contentGrewUnderneath_keepsFollowing() {
        let follow = CallJournalFollow.live.scrolled(from: metrics(offset: 1600, content: 2000), to: metrics(offset: 1600, content: 2080))
        XCTAssertTrue(follow.isFollowing)
    }

    func test_scrolled_firstReading_awayFromTheBottom_keepsTheState() {
        XCTAssertEqual(CallJournalFollow.live.scrolled(from: nil, to: metrics(offset: 0)), .live)
    }

    func test_scrolled_shortJournal_isAlwaysLive() {
        let follow = CallJournalFollow(isFollowing: false, hasUnseen: false).scrolled(from: metrics(offset: 10), to: metrics(offset: 0, content: 200))
        XCTAssertEqual(follow, .live)
    }

    func test_lineArrived_whileReading_marksUnseen() {
        let reading = CallJournalFollow(isFollowing: false, hasUnseen: false)
        XCTAssertTrue(reading.lineArrived().hasUnseen)
        XCTAssertFalse(reading.lineArrived().isFollowing)
    }

    func test_lineArrived_whileFollowing_staysLive() {
        XCTAssertEqual(CallJournalFollow.live.lineArrived(), .live)
    }

    // MARK: - Les surfaces

    /// Le journal de la pilule est UNE liste paresseuse (#17343 : plus de feuille, plus de
    /// panneau audio) ; les sous-titres ne résolvent que leurs deux dernières phrases.
    func test_journalSurfaces_shareOneLazyList_andTheBandResolvesTwoLines() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.callViewSource())
        let list = try XCTUnwrap(code.range(of: "struct CallJournalList: View {"))
        let body = String(code[list.upperBound...].prefix(2500))
        XCTAssertTrue(body.contains("LazyVStack("))
        XCTAssertTrue(body.contains("CallJournalFollow"))
        XCTAssertTrue(code.contains("CallJournalList(items: items"), "Le panneau du journal, dans la pilule, monte la liste commune")
        XCTAssertFalse(code.contains("CallCaptionsJournalSheet"), "Le journal n'est plus une feuille modale (#17343)")
        XCTAssertFalse(code.contains("transcriptPanel"), "Plus de panneau audio hors de la pilule (#17343)")
        XCTAssertTrue(code.contains("band.items.suffix(2).map(band.line)"), "#16665 — le bandeau lit les mêmes lignes, captures comprises ; sa surface est la sienne (#17678)")
        let service = try AppSourceGuard.unit("Meeshy/Features/Call/Services/CallTranscriptionService.swift")
        XCTAssertFalse(service.contains("segmentRetentionLimit"), "Plus de plafond de 50 phrases sur le journal")
    }

    // MARK: - Le journal dans la pilule défile sans image perdue (#17343)

    private func captionLine(_ text: String, id: UUID = UUID(uuidString: "00000000-0000-0000-0000-000000000001")!) -> CallCaptionLine {
        CallCaptionLine(
            id: id, speakerId: "peer", speakerName: "Awa", text: text, languageTag: nil, isFinal: true,
            capturedAt: Date(timeIntervalSince1970: 0), isShowingOriginal: true, canRevealOriginal: false
        )
    }

    /// Une phrase qui arrive ne redessine pas les lignes déjà lues : une ligne se compare
    /// par ce qu'elle MONTRE, jamais par l'action qu'elle porte.
    func test_captionRow_isEqualWhenItShowsTheSameLine_whateverItsAction() {
        let same = captionLine("Salut")
        XCTAssertTrue(CallCaptionRow(line: same, onToggleOriginal: {}) == CallCaptionRow(line: same, onToggleOriginal: { _ = same.id }))
        XCTAssertFalse(CallCaptionRow(line: same, onToggleOriginal: {}) == CallCaptionRow(line: captionLine("Salut !"), onToggleOriginal: {}))
        XCTAssertFalse(CallCaptionRow(line: same, onToggleOriginal: {}) == CallCaptionRow(line: same, showsTime: true, onToggleOriginal: {}))
    }

    func test_journalAndCaptions_redrawOnlyTheRowThatChanged() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.callViewSource())
        let list = try XCTUnwrap(code.range(of: "struct CallJournalList: View {"))
        XCTAssertTrue(String(code[list.upperBound...].prefix(2500)).contains(".equatable()"), "Le journal")
        let band = try XCTUnwrap(code.range(of: "struct CallCaptionsBand: View {"))
        XCTAssertTrue(String(code[band.upperBound...].prefix(2000)).contains(".equatable()"), "Les sous-titres")
    }

    /// P6.3 — la tête du journal dit « Journal » à gauche et porte la bascule Traduit /
    /// Original à droite ; la planche n'y dessine ni titre de feuille ni « Fermer ».
    /// On range le journal par le (…) ou le bouton Journal, et Échap (VoiceOver,
    /// clavier) le ferme sans rien afficher de plus.
    func test_journalPanelHeader_isJournalThenTheToggle_withoutACloseButton() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.callViewSource())
        let panel = try XCTUnwrap(code.range(of: "struct CallJournalPanel: View {"))
        let header = String(code[panel.upperBound...].prefix(2500))
        let title = try XCTUnwrap(header.range(of: "Text(CallCaptionsCopy.journal)"))
        let picker = try XCTUnwrap(header.range(of: "Picker(CallCaptionsCopy.journalTitle"))
        XCTAssertLessThan(title.lowerBound, picker.lowerBound, "« Journal » à gauche, la bascule à sa droite")
        XCTAssertFalse(header.contains("closePanel"), "Pas de « Fermer » dans la tête du journal (P6.3)")
        XCTAssertFalse(header.contains("CallPanelHeaderButton"))
        XCTAssertTrue(header.contains(".dismissOnEscape(onClose)"), "Échap ferme le journal, sans bouton de plus")
    }

    /// P6.4 — la ligne méta d'une phrase du journal : pseudo (et étiquette) à gauche, heure DANS
    /// l'appel à droite ; plus d'heure murale entre parenthèses collée au pseudo.
    func test_captionRow_timeOfTheCall_endsTheMetaLine() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.callViewSource())
        let row = try XCTUnwrap(code.range(of: "struct CallCaptionRow: View {"))
        let end = try XCTUnwrap(code.range(of: "struct CallCaptionsBand: View {", range: row.upperBound ..< code.endIndex))
        let body = String(code[row.upperBound ..< end.lowerBound])
        let name = try XCTUnwrap(body.range(of: "Text(line.speakerName)"))
        let spacer = try XCTUnwrap(body.range(of: "Spacer(minLength: 0)"))
        let time = try XCTUnwrap(body.range(of: "Text(time)"))
        XCTAssertLessThan(name.lowerBound, spacer.lowerBound)
        XCTAssertLessThan(spacer.lowerBound, time.lowerBound, "L'heure va à droite du pseudo")
        XCTAssertFalse(body.contains("speakerHeading"))
        XCTAssertFalse(body.contains("time: .shortened"), "Plus d'heure murale")
    }

    /// La feuille d'avant prenait le focus d'elle-même ; le journal posé DANS la pilule y
    /// conduit VoiceOver, sur son titre, à chaque ouverture.
    func test_journalPanel_leadsVoiceOverToItsTitle_whenItOpens() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.callViewSource())
        let panel = try XCTUnwrap(code.range(of: "struct CallJournalPanel: View {"))
        let body = String(code[panel.upperBound...].prefix(2500))
        XCTAssertTrue(body.contains("@AccessibilityFocusState"))
        XCTAssertTrue(body.contains(".accessibilityFocused("))
        XCTAssertTrue(body.contains(".onAppear"))
    }
}
