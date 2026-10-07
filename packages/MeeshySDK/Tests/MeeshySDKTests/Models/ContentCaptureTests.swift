import Testing
import Foundation
@testable import MeeshySDK

/// #9617 — la capture d'un contenu qui disparaît : ce qui se déclare, sous
/// quel identifiant, et comment l'avis qui en résulte se lit et se dit. Les
/// cas de l'avis reprennent ceux du témoin TS
/// (`packages/shared/__tests__/capture-notice.test.ts`).
@Suite("ContentCapture — déclarer une capture et lire son avis (#9617)")
struct ContentCaptureTests {

    private static let flameId = String(repeating: "a", count: 24)
    private static let onceId = String(repeating: "b", count: 24)
    private static let plainId = String(repeating: "c", count: 24)
    private static let mineId = String(repeating: "d", count: 24)

    private static func candidate(
        _ messageId: String,
        _ capture: ContentExitLaw.CaptureVerdict,
        conversation: String = "conv-1",
        isMine: Bool = false
    ) -> ContentCaptureCandidate {
        ContentCaptureCandidate(conversationId: conversation, messageId: messageId, capture: capture, isMine: isMine)
    }

    private static var screen: [ContentCaptureCandidate] {
        [
            candidate(flameId, .announced),
            candidate(onceId, .blocked),
            candidate(plainId, .free),
            candidate(mineId, .announced, isMine: true),
            candidate("cid_optimiste", .announced),
        ]
    }

    // MARK: - Ce qui se déclare

    @Test("une capture déclare les flammes et les vues uniques d'autrui, jamais l'ordinaire, les siennes ni un message en vol")
    func screenshotDeclaresOnlyNonOrdinaryOthers() {
        let reports = ContentCaptureReport.reports(for: Self.screen, kind: .screenshot, captureId: "cap_0123456789")
        #expect(reports == [
            ContentCaptureReport(conversationId: "conv-1", messageIds: [Self.flameId, Self.onceId], kind: .screenshot, captureId: "cap_0123456789"),
        ])
    }

    @Test("rien à l'écran qui se déclare ⇒ aucune déclaration")
    func nothingDeclarable_noReport() {
        let reports = ContentCaptureReport.reports(
            for: [Self.candidate(Self.plainId, .free), Self.candidate(Self.mineId, .blocked, isMine: true)],
            kind: .screenshot, captureId: "cap_0123456789"
        )
        #expect(reports.isEmpty)
    }

    @Test("un lot par conversation, dédoublonné, au plus 50 messages")
    func groupsDedupesAndChunks() {
        let many = (0..<55).map { Self.candidate(String(format: "%024x", $0), .announced) }
        let other = Self.candidate(Self.flameId, .announced, conversation: "conv-2")
        let reports = ContentCaptureReport.reports(for: many + [other, many[0]], kind: .screenshot, captureId: "cap_0123456789")
        #expect(reports.map(\.conversationId) == ["conv-1", "conv-1", "conv-2"])
        #expect(reports.map(\.messageIds.count) == [50, 5, 1])
    }

    @Test("un identifiant de capture neuf est valide, et deux ne se ressemblent pas")
    func newCaptureIdIsValidAndFresh() {
        let first = ContentCaptureReport.newCaptureId()
        #expect(ContentCaptureReport.isValidCaptureId(first))
        #expect(first != ContentCaptureReport.newCaptureId())
        #expect(!ContentCaptureReport.isValidCaptureId("short"))
        #expect(!ContentCaptureReport.isValidCaptureId("cap:0123456789"))
        #expect(!ContentCaptureReport.isValidCaptureId(String(repeating: "x", count: 65)))
    }

    @Test("la charge du socket porte les quatre champs du contrat")
    func socketPayloadMatchesTheContract() {
        let report = ContentCaptureReport(conversationId: "conv-1", messageIds: [Self.flameId], kind: .recording, captureId: "cap_0123456789")
        #expect(report.socketPayload["conversationId"] as? String == "conv-1")
        #expect(report.socketPayload["messageIds"] as? [String] == [Self.flameId])
        #expect(report.socketPayload["kind"] as? String == "recording")
        #expect(report.socketPayload["captureId"] as? String == "cap_0123456789")
    }

    // MARK: - Un enregistrement garde UN identifiant

    @Test("un enregistrement déclare sous un identifiant stable, chaque éphémère une seule fois")
    func recordingKeepsOneCaptureIdAndDeclaresEachOnce() {
        var tracker = ContentCaptureTracker()
        let t0 = Date(timeIntervalSince1970: 1_000)
        let start = tracker.recordingStarted(visible: [Self.candidate(Self.flameId, .announced)], captureId: "rec_0123456789", at: t0)
        #expect(start.map(\.captureId) == ["rec_0123456789"])
        #expect(start.first?.kind == .recording)
        #expect(start.first?.messageIds == [Self.flameId])

        let again = tracker.note(visible: [Self.candidate(Self.flameId, .announced)], at: t0.addingTimeInterval(30))
        #expect(again.isEmpty, "un éphémère déjà déclaré ne se redéclare pas pendant le même enregistrement")

        let newcomer = tracker.note(
            visible: [Self.candidate(Self.flameId, .announced), Self.candidate(Self.onceId, .blocked)],
            at: t0.addingTimeInterval(31)
        )
        #expect(newcomer == [ContentCaptureReport(conversationId: "conv-1", messageIds: [Self.onceId], kind: .recording, captureId: "rec_0123456789")])
    }

    @Test("pendant un enregistrement, une conversation ne part pas plus d'une fois par intervalle — rien ne se perd")
    func recordingThrottlesPerConversation() {
        var tracker = ContentCaptureTracker()
        let t0 = Date(timeIntervalSince1970: 1_000)
        _ = tracker.recordingStarted(visible: [Self.candidate(Self.flameId, .announced)], captureId: "rec_0123456789", at: t0)
        let tooSoon = tracker.note(visible: [Self.candidate(Self.onceId, .blocked)], at: t0.addingTimeInterval(2))
        #expect(tooSoon.isEmpty)
        let later = tracker.note(visible: [], at: t0.addingTimeInterval(ContentCaptureTracker.recordingFlushInterval))
        #expect(later.first?.messageIds == [Self.onceId])
    }

    @Test("la fin de l'enregistrement vide l'attente, et le suivant a un identifiant neuf")
    func recordingEndFlushesAndForgets() {
        var tracker = ContentCaptureTracker()
        let t0 = Date(timeIntervalSince1970: 1_000)
        _ = tracker.recordingStarted(visible: [Self.candidate(Self.flameId, .announced)], captureId: "rec_0123456789", at: t0)
        _ = tracker.note(visible: [Self.candidate(Self.onceId, .blocked)], at: t0.addingTimeInterval(1))
        let last = tracker.recordingEnded(visible: [], at: t0.addingTimeInterval(2))
        #expect(last.first?.messageIds == [Self.onceId])
        #expect(!tracker.isRecording)

        let next = tracker.recordingStarted(visible: [Self.candidate(Self.flameId, .announced)], captureId: "rec_9999999999", at: t0.addingTimeInterval(60))
        #expect(next.first?.captureId == "rec_9999999999")
        #expect(next.first?.messageIds == [Self.flameId], "un nouvel enregistrement redéclare ce qu'il voit")
    }

    @Test("une déclaration d'enregistrement échouée se rejoue sous le même identifiant")
    func failedRecordingReportIsRetried() {
        var tracker = ContentCaptureTracker()
        let t0 = Date(timeIntervalSince1970: 1_000)
        let start = tracker.recordingStarted(visible: [Self.candidate(Self.flameId, .announced)], captureId: "rec_0123456789", at: t0)
        start.forEach { tracker.reportFailed($0) }
        let retry = tracker.note(visible: [Self.candidate(Self.flameId, .announced)], at: t0.addingTimeInterval(10))
        #expect(retry == start)
    }

    @Test("une capture d'écran pendant un enregistrement a son identifiant à elle")
    func screenshotDuringRecordingHasItsOwnId() {
        var tracker = ContentCaptureTracker()
        _ = tracker.recordingStarted(visible: [], captureId: "rec_0123456789", at: Date())
        let shot = tracker.screenshot(visible: [Self.candidate(Self.flameId, .announced)], captureId: "cap_0123456789")
        #expect(shot.map(\.captureId) == ["cap_0123456789"])
        #expect(shot.map(\.kind) == [.screenshot])
    }

    // MARK: - L'accusé du socket

    @Test("l'accusé rend les messages annoncés ; un refus ou une échéance est un refus")
    func socketAck() {
        let ok: [String: Any] = ["success": true, "data": ["noticedMessageIds": [Self.flameId]]]
        #expect((try? MessageSocketManager.contentCaptureAck(ok).get()) == [Self.flameId])
        let refused: [String: Any] = ["success": false, "error": "x", "code": "RATE_LIMITED"]
        #expect(throws: ContentCaptureRefusal(code: "RATE_LIMITED")) { try MessageSocketManager.contentCaptureAck(refused).get() }
        #expect(throws: ContentCaptureRefusal(code: "TIMEOUT")) { try MessageSocketManager.contentCaptureAck("NO ACK").get() }
        #expect(ContentCaptureRefusal(code: "RATE_LIMITED").isFinal)
        #expect(!ContentCaptureRefusal(code: "TIMEOUT").isFinal)
    }

    @Test("sans socket, la déclaration part par le jumeau REST avec le même identifiant")
    func restFallbackWhenSocketIsAbsent() async throws {
        let api = MockAPIClient()
        let response = try JSONDecoder().decode(
            APIResponse<ContentCaptureService.Noticed>.self,
            from: Data(#"{"success":true,"data":{"noticedMessageIds":["\#(Self.flameId)"]}}"#.utf8)
        )
        api.stub("/api/v1/conversations/conv-1/messages/capture", result: response)
        let service = ContentCaptureService(api: api, socket: { _ in throw ContentCaptureRefusal(code: "NO_SOCKET") })
        let report = ContentCaptureReport(conversationId: "conv-1", messageIds: [Self.flameId], kind: .screenshot, captureId: "cap_0123456789")
        let noticed = try await service.sendContentCapture(report)
        #expect(noticed == [Self.flameId])
        #expect(api.lastRequest?.method == "POST")
        #expect(api.lastRequest?.bodyJSON?["captureId"] as? String == "cap_0123456789")
        #expect(api.lastRequest?.bodyJSON?["conversationId"] == nil, "la conversation est dans l'adresse")
    }

    @Test("un refus final du socket ne se rejoue pas en REST")
    func finalSocketRefusalIsNotReplayed() async {
        let api = MockAPIClient()
        let service = ContentCaptureService(api: api, socket: { _ in throw ContentCaptureRefusal(code: "NOT_A_PARTICIPANT") })
        let report = ContentCaptureReport(conversationId: "conv-1", messageIds: [Self.flameId], kind: .screenshot, captureId: "cap_0123456789")
        await #expect(throws: ContentCaptureRefusal(code: "NOT_A_PARTICIPANT")) { try await service.sendContentCapture(report) }
        #expect(api.requestCount == 0)
    }

    // MARK: - L'avis : la métadonnée VALIDÉE, jamais castée

    private static func noticeJSON(
        nature: String = "timed-flame",
        outcome: String = "announced",
        captureKind: String = "screenshot",
        sentAt: String = "2026-10-07T12:05:00.000Z",
        actor: String = #"{"participantId":"p-actor","displayName":"Alice"}"#
    ) -> Data {
        Data(#"{"kind":"content-capture","actor":\#(actor),"capturedMessageId":"\#(flameId)","nature":"\#(nature)","outcome":"\#(outcome)","captureKind":"\#(captureKind)","sentAt":"\#(sentAt)"}"#.utf8)
    }

    private static func notice(
        nature: String = "timed-flame",
        outcome: String = "announced",
        captureKind: String = "screenshot",
        sentAt: String = "2026-10-07T12:05:00.000Z",
        actor: String = #"{"participantId":"p-actor","displayName":"Alice"}"#
    ) throws -> CaptureNoticeMetadata {
        try JSONDecoder().decode(
            CaptureNoticeMetadata.self,
            from: noticeJSON(nature: nature, outcome: outcome, captureKind: captureKind, sentAt: sentAt, actor: actor)
        )
    }

    @Test("relit un avis complet, et il fait l'aller-retour")
    func parsesAndRoundTrips() throws {
        let parsed = try Self.notice()
        #expect(parsed.actor.displayName == "Alice")
        #expect(parsed.nature == .timedFlame)
        #expect(parsed.outcome == .announced)
        #expect(parsed.captureKind == .screenshot)
        #expect(parsed.sentAt == Date(timeIntervalSince1970: 1_791_374_700))
        let again = try JSONDecoder().decode(CaptureNoticeMetadata.self, from: JSONEncoder().encode(parsed))
        #expect(again == parsed)
    }

    @Test("refuse une autre famille, une heure illisible, une sorte de capture inconnue, une issue qui contredit la nature")
    func refusesWrongShapes() {
        #expect(throws: (any Error).self) {
            try JSONDecoder().decode(CaptureNoticeMetadata.self, from: Data(#"{"kind":"member-joined","participantId":"p","displayName":"A"}"#.utf8))
        }
        #expect(throws: (any Error).self) { try Self.notice(sentAt: "hier") }
        #expect(throws: (any Error).self) { try Self.notice(captureKind: "photo") }
        #expect(throws: (any Error).self) { try Self.notice(nature: "view-once", outcome: "announced") }
        #expect(throws: (any Error).self) { try Self.notice(nature: "after-read-flame", outcome: "blocked") }
        #expect(throws: (any Error).self) { try Self.notice(nature: "ordinary", outcome: "announced") }
    }

    @Test("tolère les champs de l'acteur ajoutés par la passerelle (invité, pseudo)")
    func toleratesActorExtensions() throws {
        let guest = try Self.notice(actor: #"{"participantId":"p-2","displayName":"Bob","isAnonymous":true}"#)
        #expect(guest.actor.isAnonymous)
        let member = try Self.notice(actor: #"{"participantId":"p-1","displayName":"Bob","isAnonymous":false,"username":"bob","extra":1}"#)
        #expect(member.actor.username == "bob")
    }

    // MARK: - La phrase, dans la langue et le fuseau du LECTEUR

    private static let paris = TimeZone(identifier: "Europe/Paris")
    private static let utc = TimeZone(identifier: "UTC")

    @Test("dit en français la capture d'un éphémère avec la date et l'heure d'envoi dans le fuseau du lecteur")
    func frenchInReaderZone() throws {
        #expect(CaptureNoticeText.compose(try Self.notice(), language: "fr", timeZone: Self.paris)
                == "Alice a capturé l’éphémère du 07/10/2026 à 14:05")
    }

    @Test("change de jour quand le fuseau du lecteur le change")
    func dayFollowsTheZone() throws {
        let late = try Self.notice(sentAt: "2026-10-07T23:30:00.000Z")
        #expect(CaptureNoticeText.compose(late, language: "fr", timeZone: Self.paris) == "Alice a capturé l’éphémère du 08/10/2026 à 01:30")
        #expect(CaptureNoticeText.compose(late, language: "fr", timeZone: TimeZone(identifier: "America/New_York"))
                == "Alice a capturé l’éphémère du 07/10/2026 à 19:30")
    }

    @Test("dit l'enregistrement autrement que la capture, et la tentative sur une vue unique sans date")
    func recordingAndViewOnce() throws {
        #expect(CaptureNoticeText.compose(try Self.notice(captureKind: "recording"), language: "fr", timeZone: Self.utc)
                == "Alice a enregistré l’écran pendant l’éphémère du 07/10/2026 à 12:05")
        let once = try Self.notice(nature: "view-once", outcome: "blocked")
        #expect(CaptureNoticeText.compose(once, language: "fr", timeZone: Self.utc) == "Alice a tenté de capturer un message à vue unique — impossible")
        #expect(CaptureNoticeText.compose(try Self.notice(nature: "view-once", outcome: "blocked", captureKind: "recording"), language: "fr", timeZone: Self.utc)
                == "Alice a tenté d’enregistrer un message à vue unique — impossible")
        #expect(CaptureNoticeText.compose(once, language: "en", timeZone: Self.utc) == "Alice tried to capture a view-once message — not possible")
    }

    @Test("parle la langue du lecteur, région comprise")
    func readerLanguage() throws {
        let notice = try Self.notice()
        #expect(CaptureNoticeText.compose(notice, language: "en-US", timeZone: Self.utc).contains("Alice took a screenshot of the disappearing message from"))
        #expect(CaptureNoticeText.compose(notice, language: "es", timeZone: Self.utc).contains("Alice capturó el mensaje efímero del"))
        #expect(CaptureNoticeText.compose(notice, language: "de_DE", timeZone: Self.utc).contains("Alice hat einen Screenshot der verschwindenden Nachricht vom"))
    }

    @Test("une phrase distincte et complète pour chaque langue, nature et sorte de capture")
    func everyCombination() throws {
        var texts: [String] = []
        for language in CaptureNoticeText.languages {
            for (nature, outcome) in [("timed-flame", "announced"), ("view-once", "blocked")] {
                for kind in ["screenshot", "recording"] {
                    let notice = try Self.notice(nature: nature, outcome: outcome, captureKind: kind)
                    texts.append(CaptureNoticeText.compose(notice, language: language, timeZone: Self.utc))
                }
            }
        }
        #expect(texts.allSatisfy { $0.contains("Alice") && !$0.contains("{") })
        #expect(Set(texts).count == texts.count)
    }

    @Test("retombe sur le français hors catalogue, et sur UTC sans fuseau")
    func fallbacks() throws {
        let notice = try Self.notice()
        #expect(CaptureNoticeText.compose(notice, language: "ja", timeZone: Self.utc) == "Alice a capturé l’éphémère du 07/10/2026 à 12:05")
        #expect(CaptureNoticeText.compose(notice, language: nil, timeZone: nil) == "Alice a capturé l’éphémère du 07/10/2026 à 12:05")
        #expect(CaptureNoticeText.compose(notice, language: "fr", timeZone: CaptureNoticeText.timeZone(identifier: "Pas/UnFuseau"))
                == "Alice a capturé l’éphémère du 07/10/2026 à 12:05")
    }

    @Test("le repli est la phrase française en UTC, le fuseau DIT")
    func fallbackText() throws {
        #expect(CaptureNoticeText.fallback(try Self.notice()) == "Alice a capturé l’éphémère du 07/10/2026 à 12:05 (UTC)")
        #expect(CaptureNoticeText.fallback(try Self.notice(nature: "view-once", outcome: "blocked"))
                == "Alice a tenté de capturer un message à vue unique — impossible")
    }

    @Test("nomme un inscrit avec son pseudo, un invité comme invité — l'homonyme ne se confond pas (A8)")
    func actorIsDistinguished() throws {
        let member = try Self.notice(actor: #"{"participantId":"p-1","displayName":"Bob","isAnonymous":false,"username":"bob"}"#)
        let guest = try Self.notice(actor: #"{"participantId":"p-2","displayName":"Bob","isAnonymous":true}"#)
        #expect(CaptureNoticeText.compose(member, language: "fr", timeZone: Self.utc) == "Bob (@bob) a capturé l’éphémère du 07/10/2026 à 12:05")
        #expect(CaptureNoticeText.compose(guest, language: "fr", timeZone: Self.utc) == "Bob (invité) a capturé l’éphémère du 07/10/2026 à 12:05")
        #expect(CaptureNoticeText.compose(guest, language: "en", timeZone: Self.utc).contains("Bob (guest) took a screenshot"))
        #expect(CaptureNoticeText.fallback(guest) == "Bob (invité) a capturé l’éphémère du 07/10/2026 à 12:05 (UTC)")
    }

    @Test("un nom ne se déguise pas : contrôles de direction et caractères de contrôle retirés, longueur bornée")
    func nameIsSanitized() {
        #expect(CaptureNoticeText.sanitizedName("\u{202E}boB\u{202C}") == "boB")
        #expect(CaptureNoticeText.sanitizedName("Al\u{0000}ice\u{2066} \u{200F}  Martin\n") == "Alice Martin")
        #expect(CaptureNoticeText.sanitizedName(String(repeating: "x", count: 200)).count == 64)
        #expect(CaptureNoticeText.sanitizedName("\u{202E}\u{200F} ") == "?")
    }

    // MARK: - L'avis traverse le fil et le cache

    @Test("un message système porte son avis de capture depuis metadata, et la colonne d'avis le rend tel quel")
    func apiMessageAndCacheColumnCarryTheNotice() throws {
        let metadata = String(decoding: Self.noticeJSON(), as: UTF8.self)
        let json = #"{"id":"\#(Self.plainId)","conversationId":"conv-1","senderId":"p-actor","content":"Alice a capturé l’éphémère du 07/10/2026 à 12:05 (UTC)","messageType":"system","messageSource":"system","createdAt":"2026-10-07T12:06:00.000Z","metadata":\#(metadata)}"#
        let api = try APIClient.makeAPIPayloadDecoder().decode(APIMessage.self, from: Data(json.utf8))
        #expect(api.captureNotice?.nature == .timedFlame)
        #expect(api.joinNotice == nil)

        let column = try #require(api.systemNoticeJson(encoder: JSONEncoder()))
        let relu = SystemNoticeColumn.decode(column, decoder: JSONDecoder(), id: "x")
        #expect(relu.capture == api.captureNotice)
        #expect(relu.join == nil)
    }

    @Test("la colonne d'avis relit encore un avis d'arrivée, et ignore un kind inconnu")
    func cacheColumnStillReadsJoinNotices() throws {
        let join = JoinNoticeMetadata(participantId: "p", displayName: "Zoé", isAnonymous: true, viaShareLink: true)
        let column = SystemNoticeColumn.encode(join: join, capture: nil, encoder: JSONEncoder(), id: "x")
        #expect(SystemNoticeColumn.decode(column, decoder: JSONDecoder(), id: "x").join == join)
        #expect(SystemNoticeColumn.decode(Data(#"{"kind":"member-left"}"#.utf8), decoder: JSONDecoder(), id: "x").capture == nil)
    }
}
