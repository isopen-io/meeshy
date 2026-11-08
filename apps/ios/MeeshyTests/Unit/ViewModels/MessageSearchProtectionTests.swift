import XCTest
import GRDB
@testable import Meeshy
import MeeshySDK

@MainActor
final class MessageSearchProtectionTests: XCTestCase {

    private func hit(content: String = "rendez-vous secret", protection: String = "") -> String {
        """
        {"id":"m1","conversationId":"c1","createdAt":"2026-11-02T10:00:00.000Z","messageType":"text",
         "content":"\(content)","servedLanguage":null,"originalContent":"\(content)","originalLanguage":null,
         "sender":{"id":"p1","userId":"u1","displayName":"Aminata","username":"ami","avatar":null},
         "conversation":{"id":"c1","identifier":null,"type":"group","title":"Equipe","avatar":null}\(protection)}
        """
    }

    private func page(_ hits: [String]) -> PaginatedAPIResponse<[APIMessageSearchHit]> {
        JSONStub.decode("""
        {"success":true,"data":[\(hits.joined(separator: ","))],
         "pagination":{"limit":30,"hasMore":false,"nextCursor":null}}
        """)
    }

    private func makeService(api: MockAPIClientForApp, reader: any DatabaseReader) -> ConversationMessageSearchService {
        ConversationMessageSearchService(api: api, searchService: MessageSearchService(reader: reader), cachedConversations: { [] })
    }

    private func remoteResult(_ hitJSON: String) async throws -> GlobalSearchMessageResult {
        let api = MockAPIClientForApp()
        api.stub("/messages/search", result: page([hitJSON]))
        let leg = await makeService(api: api, reader: try DatabaseQueue()).remoteMessages(query: "rendez", reader: nil)
        return try XCTUnwrap(leg.items.first)
    }

    private func makeResult(content: String, isVeiled: Bool, mediaKind: APIMessageSearchHit.MediaKind? = nil) -> GlobalSearchMessageResult {
        GlobalSearchMessageResult(
            id: "m1", conversationId: "c1", conversationName: "Equipe", conversationAvatar: nil,
            content: content, senderName: "Aminata", senderAvatar: nil,
            createdAt: Date(timeIntervalSince1970: 0), isVeiled: isVeiled, mediaKind: mediaKind
        )
    }

    // MARK: - Volet réseau

    func test_remoteMessages_declaresTheProtectionCapability() async throws {
        let api = MockAPIClientForApp()
        api.stub("/messages/search", result: page([hit()]))

        _ = await makeService(api: api, reader: try DatabaseQueue()).remoteMessages(query: "rendez", reader: nil)

        XCTAssertEqual(api.lastRequestHeaders?["X-Search-Caps"], "1", "sans la capacité, la passerelle ne sert ni flouté ni transcription")
    }

    func test_remoteMessages_blurredHit_isVeiledAndCarriesNoText() async throws {
        let result = try await remoteResult(hit(protection: #","isBlurred":true"#))

        XCTAssertTrue(result.isVeiled)
        XCTAssertEqual(result.content, "", "un flouté ne transporte aucun caractère jusqu'à la vue")
        XCTAssertEqual(result.id, "m1", "le toucher ouvre toujours la conversation sur le message")
        XCTAssertEqual(result.conversationId, "c1")
    }

    func test_remoteMessages_clearHit_keepsItsText() async throws {
        let result = try await remoteResult(hit())

        XCTAssertFalse(result.isVeiled)
        XCTAssertEqual(result.content, "rendez-vous secret")
        XCTAssertNil(result.mediaIcon)
    }

    func test_remoteMessages_transcriptHit_paintsTheTranscriptWithItsMediaIcon() async throws {
        let result = try await remoteResult(hit(content: "", protection: """
        ,"match":"transcript","transcript":{"attachmentId":"a1","mediaKind":"audio","text":"on se voit au rendez-vous","servedLanguage":null,"durationMs":3000}
        """))

        XCTAssertEqual(result.content, "on se voit au rendez-vous")
        XCTAssertEqual(result.mediaKind, .audio)
        XCTAssertEqual(result.mediaIcon, "mic.fill")
        XCTAssertFalse(result.isVeiled)
    }

    func test_remoteMessages_blurredTranscript_isVeiledButKeepsItsMediaIcon() async throws {
        let result = try await remoteResult(hit(content: "", protection: """
        ,"isBlurred":true,"match":"transcript","transcript":{"attachmentId":"a1","mediaKind":"video","text":"secret dit","servedLanguage":null,"durationMs":null}
        """))

        XCTAssertTrue(result.isVeiled)
        XCTAssertEqual(result.content, "")
        XCTAssertEqual(result.mediaIcon, "video.fill")
    }

    func test_mediaIcon_eachKindHasItsGlyph() {
        let icons = APIMessageSearchHit.MediaKind.allCases.map { makeResult(content: "x", isVeiled: false, mediaKind: $0).mediaIcon }

        XCTAssertEqual(icons, ["mic.fill", "video.fill", "photo.fill", "doc.fill"])
    }

    // MARK: - Volet local

    func test_localMessages_blurredCachedMessage_isVeiled() async throws {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        try await pool.write { db in
            var blurred = SearchTestMessageRecordFactory.make(localId: "m-blur", conversationId: "conv-1", content: "rendez-vous secret")
            blurred.effectFlags = MessageEffectFlags.blurred.rawValue
            try blurred.insert(db)
            try SearchTestMessageRecordFactory.make(localId: "m-clear", conversationId: "conv-1", content: "rendez-vous public").insert(db)
        }

        let results = await makeService(api: MockAPIClientForApp(), reader: pool).localMessages(query: "rendez", reader: nil)
        let byId = Dictionary(uniqueKeysWithValues: results.map { ($0.id, $0) })

        XCTAssertEqual(byId["m-blur"]?.isVeiled, true)
        XCTAssertEqual(byId["m-blur"]?.content, "")
        XCTAssertEqual(byId["m-clear"]?.isVeiled, false)
        XCTAssertEqual(byId["m-clear"]?.content, "rendez-vous public")
    }

    // MARK: - Rangée

    func test_accessibilityLabel_veiled_saysBlurredAndNeverTheText() {
        let label = MessageSearchResultRow.accessibilityLabel(makeResult(content: "rendez-vous secret", isVeiled: true))

        XCTAssertTrue(label.contains(MessageSearchResultRow.veiledLabel))
        XCTAssertFalse(label.contains("secret"))
    }

    func test_accessibilityLabel_transcript_namesTheMediaBeforeTheText() {
        let label = MessageSearchResultRow.spokenExcerpt(makeResult(content: "on se voit", isVeiled: false, mediaKind: .audio))

        XCTAssertEqual(label, "\(MessageSearchResultRow.mediaLabel(.audio)), on se voit")
    }
}
