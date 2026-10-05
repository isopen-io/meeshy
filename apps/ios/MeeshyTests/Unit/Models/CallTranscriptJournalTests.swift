import XCTest
@testable import Meeshy

/// #8579 — le journal de l'appel garde TOUTES les phrases, dans l'ordre de
/// capture, et ne saute jamais en bas pendant qu'on relit.
@MainActor
final class CallTranscriptJournalTests: XCTestCase {

    private func segment(_ text: String, at seconds: TimeInterval) -> Meeshy.TranscriptionSegment {
        Meeshy.TranscriptionSegment(
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

    func test_bounded_underTheCeiling_keepsEverything() {
        let journal = (0 ..< 500).map { segment("\($0)", at: TimeInterval($0)) }
        XCTAssertEqual(CallTranscriptJournal.bounded(journal).count, 500)
    }

    func test_ceiling_holdsHoursOfConversation() {
        XCTAssertGreaterThanOrEqual(CallTranscriptJournal.ceiling, 10_000)
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

    /// Le journal, le panneau audio et la feuille partagent UNE liste
    /// paresseuse ; le bandeau ne résout que ses deux dernières phrases.
    func test_journalSurfaces_shareOneLazyList_andTheBandResolvesTwoLines() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.callViewSource())
        let list = try XCTUnwrap(code.range(of: "struct CallJournalList: View {"))
        let body = String(code[list.upperBound...].prefix(2500))
        XCTAssertTrue(body.contains("LazyVStack("))
        XCTAssertTrue(body.contains("CallJournalFollow"))
        XCTAssertTrue(code.contains("CallJournalList(segments: segments"), "La feuille du journal monte la liste commune")
        XCTAssertTrue(code.contains("CallJournalList(\n            segments: transcriptionService.displayedSegments"), "Le panneau audio aussi")
        XCTAssertTrue(code.contains("transcriptionService.displayedSegments.suffix(2).map(captionLine)"))
        let service = try AppSourceGuard.unit("Meeshy/Features/Main/Services/CallTranscriptionService.swift")
        XCTAssertFalse(service.contains("segmentRetentionLimit"), "Plus de plafond de 50 phrases sur le journal")
    }
}
