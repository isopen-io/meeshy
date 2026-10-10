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

    @MainActor
    private final class RecordingDeclarer: ContentCaptureDeclaring {
        nonisolated deinit {}
        private(set) var reports: [ContentCaptureReport] = []
        func declare(_ reports: [ContentCaptureReport]) { self.reports += reports }
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
    ) -> (sut: ContentCaptureReporter, sender: RecordingDeclarer) {
        let sender = RecordingDeclarer()
        let queue = IdQueue(ids)
        let sut = ContentCaptureReporter(
            declarer: sender,
            isConversationCovered: { covered },
            isScreenCaptured: { false },
            now: { Date(timeIntervalSince1970: 1_000) },
            newCaptureId: { queue.next() }
        )
        return (sut, sender)
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

    /// Une citation dont la nature n'est pas déclarée (flamme après lecture pas
    /// encore consommée : ni échéance, ni drapeau) se déclare quand même — la
    /// passerelle juge sur le cité réel.
    func test_candidates_quoteOfUndeclaredNature_isDeclaredAnyway() {
        var reply = message(Self.plainId)
        reply.replyTo = ReplyReference(messageId: Self.flameId, authorName: "Bob", previewText: "…")
        let declared = ContentCaptureVisibility.candidates(for: reply, serverId: Self.plainId).filter(\.isDeclared)
        XCTAssertEqual(declared.map(\.messageId), [Self.flameId])
    }

    /// Une réponse encore en vol montre sa citation : la citation se déclare.
    func test_candidates_inFlightReply_stillDeclaresItsQuote() {
        var reply = message("cid_0f3c0b9e-1b2a-4c5d-8e7f-001122334455", isMe: true)
        var quote = ReplyReference(messageId: Self.flameId, authorName: "Bob", previewText: "secret")
        quote.quotedExitNature = .timedFlame
        reply.replyTo = quote
        let declared = ContentCaptureVisibility.candidates(for: reply, serverId: nil).filter(\.isDeclared)
        XCTAssertEqual(declared.map(\.messageId), [Self.flameId])
    }

    /// Annoncé OU noir : une flamme d'autrui sans identifiant serveur ne peut
    /// pas s'annoncer — la peau la rend noire.
    func test_renderedVerdict_flameWithoutServerId_isBlack_untilResolved() {
        let unresolved = message("cid_0f3c0b9e-1b2a-4c5d-8e7f-001122334455", flags: .ephemeral, duration: 30)
        XCTAssertEqual(ContentCaptureVisibility.renderedVerdict(for: unresolved), .blocked)
        XCTAssertTrue(ContentCaptureVisibility.renderedVerdict(for: unresolved).shieldsCapture(surfaceAnnounces: true))
        let resolved = message(Self.flameId, flags: .ephemeral, duration: 30)
        XCTAssertEqual(ContentCaptureVisibility.renderedVerdict(for: resolved), .announced)
        let mine = message("cid_0f3c0b9e-1b2a-4c5d-8e7f-001122334455", flags: .ephemeral, duration: 30, isMe: true)
        XCTAssertEqual(ContentCaptureVisibility.renderedVerdict(for: mine), .announced)
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
        XCTAssertEqual(sender.reports.count, 1)
    }

    func test_screenshot_withNothingDeclarable_sendsNothing() async {
        let (sut, sender) = makeSUT()
        let source = StubSource(candidates: [
            ContentCaptureCandidate(conversationId: "conv-1", messageId: Self.plainId, capture: .free, isMine: false),
        ])
        sut.register(source)
        sut.screenshotTaken()
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
        XCTAssertEqual(sender.reports, [])
    }

    // MARK: - La phrase de l'avis, dans les quatre modes

    private func captureNotice(guest: Bool = false) throws -> CaptureNoticeMetadata {
        let actor = guest
            ? #"{"participantId":"p-2","displayName":"Bob","isAnonymous":true}"#
            : #"{"participantId":"p-1","displayName":"Alice","isAnonymous":false}"#
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
