import XCTest
import MeeshySDK
@testable import Meeshy

/// #9617 — une capture d'un contenu qui disparaît s'annonce au fil : ce que
/// chaque surface déclare, ce que le rapporteur envoie, et la phrase de l'avis
/// dans les quatre modes.
@MainActor
final class ContentCaptureReporterTests: XCTestCase {

    private static let flameId = String(repeating: "a", count: 24)
    private static let onceId = String(repeating: "b", count: 24)
    private static let plainId = String(repeating: "c", count: 24)
    private static let mineId = String(repeating: "d", count: 24)

    // MARK: - Fabriques

    private func message(
        _ id: String,
        flags: MessageEffectFlags = [],
        duration: Int? = nil,
        isMe: Bool = false,
        source: MeeshyMessage.MessageSource = .user
    ) -> Message {
        var message = Message(id: id, conversationId: "conv-1", senderId: isMe ? "p-me" : "p-bob", content: "secret")
        message.effects = MessageEffects(flags: flags, ephemeralDuration: duration)
        message.isMe = isMe
        message.messageSource = source
        return message
    }

    private final class RecordingSender: ContentCaptureSending, @unchecked Sendable {
        private let lock = NSLock()
        private var stored: [ContentCaptureReport] = []
        var onSend: (@Sendable () -> Void)?

        var reports: [ContentCaptureReport] { lock.withLock { stored } }

        func sendContentCapture(_ report: ContentCaptureReport) async throws -> [String] {
            lock.withLock { stored.append(report) }
            onSend?()
            return report.messageIds
        }
    }

    @MainActor
    private final class StubSource: ContentCaptureSource {
        nonisolated deinit {}
        let isCaptureCover: Bool
        var candidates: [ContentCaptureCandidate]
        private(set) var acknowledgements = 0

        init(isCaptureCover: Bool = false, candidates: [ContentCaptureCandidate]) {
            self.isCaptureCover = isCaptureCover
            self.candidates = candidates
        }

        func visibleCaptureCandidates() -> [ContentCaptureCandidate] { candidates }
        func acknowledgeVisibleReads() { acknowledgements += 1 }
    }

    @MainActor
    private final class IdQueue {
        nonisolated deinit {}
        var ids: [String]
        init(_ ids: [String]) { self.ids = ids }
        func next() -> String { ids.isEmpty ? "cap_exhausted0" : ids.removeFirst() }
    }

    private func makeSUT(
        covered: Bool = false,
        ids: [String] = ["cap_first00001", "cap_second0002"]
    ) -> (sut: ContentCaptureReporter, sender: RecordingSender) {
        let sender = RecordingSender()
        let queue = IdQueue(ids)
        let sut = ContentCaptureReporter(
            sender: sender,
            isConversationCovered: { covered },
            isScreenCaptured: { false },
            now: { Date(timeIntervalSince1970: 1_000) },
            newCaptureId: { queue.next() },
            readSettleDelay: .zero
        )
        return (sut, sender)
    }

    private func waitForSends(_ sender: RecordingSender, count: Int) async {
        for _ in 0..<200 where sender.reports.count < count {
            await Task.yield()
        }
    }

    // MARK: - Ce qu'une rangée montre

    func test_candidates_flameOfSomeoneElse_isAnnounced() {
        let flame = message(Self.flameId, flags: .ephemeral, duration: 30)
        XCTAssertEqual(ContentCaptureVisibility.candidates(for: flame, serverId: Self.flameId), [
            ContentCaptureCandidate(conversationId: "conv-1", messageId: Self.flameId, capture: .announced, isMine: false),
        ])
    }

    func test_candidates_sealedViewOnce_showsNothing_revealedViewOnce_isBlocked() {
        var once = message(Self.onceId, flags: .viewOnce)
        XCTAssertEqual(ContentCaptureVisibility.candidates(for: once, serverId: Self.onceId), [],
                       "une bulle scellée ne montre rien : la capture de l'écran qui la porte n'est pas une tentative")
        once.isViewOnceRevealed = true
        XCTAssertEqual(ContentCaptureVisibility.candidates(for: once, serverId: Self.onceId).map(\.capture), [.blocked])
    }

    func test_candidates_systemNotice_andOrdinary_areNotDeclared() {
        XCTAssertEqual(ContentCaptureVisibility.candidates(for: message(Self.plainId, source: .system), serverId: nil), [])
        let ordinary = ContentCaptureVisibility.candidates(for: message(Self.plainId), serverId: Self.plainId)
        XCTAssertEqual(ordinary.filter(\.isDeclared), [])
    }

    func test_candidates_ordinaryReplyQuotingAFlame_declaresTheQuotedFlame() {
        var reply = message(Self.plainId)
        var quote = ReplyReference(messageId: Self.flameId, authorName: "Bob", previewText: "Le code est 4521")
        quote.quotedExpiresAt = Date(timeIntervalSince1970: 2_000_000_000)
        reply.replyTo = quote
        let declared = ContentCaptureVisibility.candidates(for: reply, serverId: Self.plainId).filter(\.isDeclared)
        XCTAssertEqual(declared.map(\.messageId), [Self.flameId])
        XCTAssertEqual(declared.map(\.capture), [.announced])
    }

    func test_candidates_presentedViewOnceMedia_isATry() {
        let once = message(Self.onceId, flags: .viewOnce)
        XCTAssertEqual(ContentCaptureVisibility.candidates(forPresented: once).map(\.capture), [.blocked])
    }

    // MARK: - Le rapporteur

    func test_screenshot_declaresTheVisibleFlames_notOwnNorOrdinary() async {
        let (sut, sender) = makeSUT()
        let source = StubSource(candidates: [
            ContentCaptureCandidate(conversationId: "conv-1", messageId: Self.flameId, capture: .announced, isMine: false),
            ContentCaptureCandidate(conversationId: "conv-1", messageId: Self.mineId, capture: .announced, isMine: true),
            ContentCaptureCandidate(conversationId: "conv-1", messageId: Self.plainId, capture: .free, isMine: false),
        ])
        sut.register(source)

        sut.screenshotTaken()
        await waitForSends(sender, count: 1)

        XCTAssertEqual(sender.reports, [
            ContentCaptureReport(conversationId: "conv-1", messageIds: [Self.flameId], kind: .screenshot, captureId: "cap_first00001"),
        ])
    }

    /// La passerelle n'annonce qu'un message LU : la surface pose l'accusé de
    /// ce qu'elle montre avant la déclaration — sinon une flamme laissée en
    /// clair serait capturée en silence.
    func test_screenshot_acknowledgesTheVisibleReads_beforeDeclaring() async {
        let (sut, sender) = makeSUT()
        let source = StubSource(candidates: [
            ContentCaptureCandidate(conversationId: "conv-1", messageId: Self.flameId, capture: .announced, isMine: false),
        ])
        sut.register(source)
        sut.screenshotTaken()
        XCTAssertEqual(source.acknowledgements, 1)
        await waitForSends(sender, count: 1)
        XCTAssertEqual(sender.reports.count, 1)
    }

    func test_aFinalRefusal_isNotRetriedDuringARecording() async {
        let sender = RefusingSender()
        let clock = Clock()
        let sut = ContentCaptureReporter(
            sender: sender, isConversationCovered: { false }, isScreenCaptured: { false },
            now: { clock.now }, newCaptureId: { "rec_0123456789" }, readSettleDelay: .zero
        )
        let source = StubSource(candidates: [
            ContentCaptureCandidate(conversationId: "conv-1", messageId: Self.flameId, capture: .announced, isMine: false),
        ])
        sut.register(source)
        sut.screenCaptureChanged(isCaptured: true)
        for _ in 0..<200 { await Task.yield() }
        clock.now = clock.now.addingTimeInterval(60)
        sut.recordingBeat()
        for _ in 0..<200 { await Task.yield() }
        XCTAssertEqual(sender.calls, 1, "RATE_LIMITED est final : pas de boucle, le message reste annonçable plus tard")
        sut.screenCaptureChanged(isCaptured: false)
    }

    @MainActor
    private final class Clock {
        nonisolated deinit {}
        var now = Date(timeIntervalSince1970: 1_000)
    }

    private final class RefusingSender: ContentCaptureSending, @unchecked Sendable {
        private let lock = NSLock()
        private var count = 0
        var calls: Int { lock.withLock { count } }

        func sendContentCapture(_ report: ContentCaptureReport) async throws -> [String] {
            lock.withLock { count += 1 }
            throw ContentCaptureRefusal(code: "RATE_LIMITED")
        }
    }

    func test_screenshot_withNothingDeclarable_sendsNothing() async {
        let (sut, sender) = makeSUT()
        let source = StubSource(candidates: [
            ContentCaptureCandidate(conversationId: "conv-1", messageId: Self.plainId, capture: .free, isMine: false),
        ])
        sut.register(source)
        sut.screenshotTaken()
        await waitForSends(sender, count: 1)
        XCTAssertEqual(sender.reports, [])
    }

    func test_screenshot_underACover_declaresOnlyWhatTheCoverShows() async {
        let (sut, sender) = makeSUT(covered: true)
        let thread = StubSource(candidates: [
            ContentCaptureCandidate(conversationId: "conv-1", messageId: Self.flameId, capture: .announced, isMine: false),
        ])
        let gallery = StubSource(isCaptureCover: true, candidates: [
            ContentCaptureCandidate(conversationId: "conv-1", messageId: Self.onceId, capture: .blocked, isMine: false),
        ])
        sut.register(thread)
        sut.register(gallery)

        sut.screenshotTaken()
        await waitForSends(sender, count: 1)

        XCTAssertEqual(sender.reports.flatMap(\.messageIds), [Self.onceId], "le fil sous un plein écran n'est pas à l'écran")
    }

    func test_twoScreenshots_haveTwoCaptureIds() async {
        let (sut, sender) = makeSUT()
        let source = StubSource(candidates: [
            ContentCaptureCandidate(conversationId: "conv-1", messageId: Self.flameId, capture: .announced, isMine: false),
        ])
        sut.register(source)
        sut.screenshotTaken()
        sut.screenshotTaken()
        await waitForSends(sender, count: 2)
        XCTAssertEqual(Set(sender.reports.map(\.captureId)), ["cap_first00001", "cap_second0002"])
    }

    func test_recording_keepsOneCaptureId_andDeclaresANewcomerOnce() async {
        let (sut, sender) = makeSUT()
        let source = StubSource(candidates: [
            ContentCaptureCandidate(conversationId: "conv-1", messageId: Self.flameId, capture: .announced, isMine: false),
        ])
        sut.register(source)

        sut.screenCaptureChanged(isCaptured: true)
        source.candidates.append(
            ContentCaptureCandidate(conversationId: "conv-1", messageId: Self.onceId, capture: .blocked, isMine: false)
        )
        sut.screenCaptureChanged(isCaptured: false)
        await waitForSends(sender, count: 2)

        XCTAssertEqual(sender.reports.map(\.kind), [.recording, .recording])
        XCTAssertEqual(Set(sender.reports.map(\.captureId)), ["cap_first00001"], "UN identifiant pour tout l'enregistrement")
        XCTAssertEqual(sender.reports.flatMap(\.messageIds), [Self.flameId, Self.onceId], "chaque éphémère une seule fois")
    }

    func test_unregisteredSource_isNoLongerAsked() async {
        let (sut, sender) = makeSUT()
        let source = StubSource(candidates: [
            ContentCaptureCandidate(conversationId: "conv-1", messageId: Self.flameId, capture: .announced, isMine: false),
        ])
        sut.register(source)
        sut.unregister(source)
        sut.screenshotTaken()
        await waitForSends(sender, count: 1)
        XCTAssertEqual(sender.reports, [])
    }

    // MARK: - La phrase de l'avis, dans les quatre modes

    private func captureNotice(guest: Bool = false) throws -> CaptureNoticeMetadata {
        let actor = guest
            ? #"{"participantId":"p-2","displayName":"Bob","isAnonymous":true}"#
            : #"{"participantId":"p-1","displayName":"Alice"}"#
        let json = #"{"kind":"content-capture","actor":\#(actor),"capturedMessageId":"\#(Self.flameId)","nature":"timed-flame","outcome":"announced","captureKind":"screenshot","sentAt":"2026-10-07T12:05:00.000Z"}"#
        return try JSONDecoder().decode(CaptureNoticeMetadata.self, from: Data(json.utf8))
    }

    func test_captureNoticeText_composesForTheReader_notTheStoredFallback() throws {
        var notice = message(Self.plainId, source: .system)
        notice.content = "Alice a capturé l’éphémère du 07/10/2026 à 12:05 (UTC)"
        notice.captureNotice = try captureNotice()
        XCTAssertEqual(
            BubbleContent.captureNoticeText(for: notice, language: "fr", timeZone: TimeZone(identifier: "Europe/Paris")!),
            "Alice a capturé l’éphémère du 07/10/2026 à 14:05"
        )
        XCTAssertTrue(BubbleContent.captureNoticeText(for: notice, language: "en", timeZone: TimeZone(identifier: "UTC")!)?
            .hasPrefix("Alice took a screenshot") == true)
    }

    func test_captureNoticeText_guestIsNamedAsGuest() throws {
        var notice = message(Self.plainId, source: .system)
        notice.captureNotice = try captureNotice(guest: true)
        XCTAssertEqual(
            BubbleContent.captureNoticeText(for: notice, language: "fr", timeZone: TimeZone(identifier: "UTC")!),
            "Bob (invité) a capturé l’éphémère du 07/10/2026 à 12:05"
        )
    }

    func test_captureNoticeText_withoutReadableMetadata_fallsBackToContent() {
        let unreadable = message(Self.plainId, source: .system)
        XCTAssertNil(BubbleContent.captureNoticeText(for: unreadable))
    }

    /// Bulles, Focal et Script lisent `text.raw` du builder ; la Rivière
    /// appelle `systemNotice` : les quatre disent la même phrase.
    func test_allFourModes_renderTheComposedSentence() throws {
        var notice = message(Self.plainId, source: .system)
        notice.content = "repli"
        notice.captureNotice = try captureNotice()
        let expected = BubbleContent.captureNoticeText(for: notice)

        let bubble = BubbleContent(message: notice, translations: [], preferredTranslation: nil, currentUserId: "p-me")
        XCTAssertEqual(bubble.kind, .system)
        XCTAssertEqual(bubble.text?.raw, expected)

        let river = RiverConversationMapping.systemNotice(for: notice, viewerId: "p-me", timeString: "12:06") { $0.content }
        guard case .plain(let text)? = river else { return XCTFail("un avis de capture se rend en ligne simple") }
        XCTAssertEqual(text, expected)
    }
}
