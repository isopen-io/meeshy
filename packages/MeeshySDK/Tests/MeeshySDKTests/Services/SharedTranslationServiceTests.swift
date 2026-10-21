import Foundation
import XCTest
@testable import MeeshySDK

/// #9899 — partager sa traduction, lire celles des autres membres. Le service
/// n'ouvre jamais l'enveloppe : il l'envoie et la rend telle que la passerelle
/// la sert.
final class SharedTranslationServiceTests: XCTestCase {

    private let conversationId = "64f0c0ffee0000000000c0de"
    private var route: String { "/conversations/\(conversationId)/shared-translations" }

    private var mock: MockAPIClient!
    private var service: SharedTranslationService!

    override func setUp() {
        super.setUp()
        mock = MockAPIClient()
        service = SharedTranslationService(api: mock)
    }

    override func tearDown() {
        mock.reset()
        super.tearDown()
    }

    // MARK: - Helpers

    private func makeSharedTranslation(id: String = "st1", messageId: String = "64f0c0ffee0000000000a001") -> SharedTranslation {
        SharedTranslation(
            id: id, conversationId: conversationId, messageId: messageId, targetLanguage: "fr",
            envelope: SharedTranslationEnvelope(kdf: .messageContent, payload: "AAECAwQFBgcICQoLIaP2d4BN5n7LZzhFfM5LMgef8yGgP//5NrcvJA9z36m/"),
            sharedBy: "participant-7", sharedAt: "2026-10-10T08:15:30.000Z"
        )
    }

    private func makeBody(sourceVersion: String = "original") -> ShareTranslationBody {
        ShareTranslationBody(
            messageId: "64f0c0ffee0000000000a001", targetLanguage: "fr",
            sourceVersion: sourceVersion,
            envelope: makeSharedTranslation().envelope
        )
    }

    private func staleSourceRejection(code: String? = SharedTranslationShareRefusal.staleSource.code) -> MeeshyError {
        MeeshyError.rejected(
            APIRejection(statusCode: 409, code: code, message: "The message changed since it was translated")
        )
    }

    private func objectId(_ index: Int) -> String {
        String(format: "%024lx", index)
    }

    private func stubList(_ translations: [SharedTranslation]) {
        mock.stub(route, result: APIResponse<SharedTranslationsResult>(
            success: true, data: SharedTranslationsResult(sharedTranslations: translations), error: nil
        ))
    }

    private func queryValue(_ request: MockAPIClient.RecordedRequest?, _ name: String) -> String? {
        request?.queryItems?.first { $0.name == name }?.value
    }

    // MARK: - share

    func test_share_postsTheSealedBodyToTheConversationRoute() async throws {
        mock.stub(route, result: APIResponse<ShareTranslationResult>(
            success: true, data: ShareTranslationResult(sharedTranslation: makeSharedTranslation(), created: true), error: nil
        ))

        _ = try await service.share(conversationId: conversationId, body: makeBody())

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, route)
        XCTAssertEqual(mock.lastRequest?.method, "POST")
        XCTAssertEqual(mock.lastRequest?.bodyJSON?["messageId"] as? String, "64f0c0ffee0000000000a001")
        XCTAssertEqual(mock.lastRequest?.bodyJSON?["targetLanguage"] as? String, "fr")
        let envelope = mock.lastRequest?.bodyJSON?["envelope"] as? [String: Any]
        XCTAssertEqual(envelope?["kdf"] as? String, "message-content")
        XCTAssertEqual(envelope?["alg"] as? String, "A256GCM")
    }

    func test_share_postsTheVersionOfTheTextThatWasTranslated() async throws {
        mock.stub(route, result: APIResponse<ShareTranslationResult>(
            success: true, data: ShareTranslationResult(sharedTranslation: makeSharedTranslation(), created: true), error: nil
        ))

        _ = try await service.share(conversationId: conversationId, body: makeBody(sourceVersion: "2026-10-10T08:15:30.123Z"))

        XCTAssertEqual(mock.lastRequest?.bodyJSON?["sourceVersion"] as? String, "2026-10-10T08:15:30.123Z")
    }

    func test_share_rendersWhatTheGatewayServed_whenAnotherMemberWasFirst() async throws {
        let theirs = makeSharedTranslation(id: "theirs")
        mock.stub(route, result: APIResponse<ShareTranslationResult>(
            success: true, data: ShareTranslationResult(sharedTranslation: theirs, created: false), error: nil
        ))

        let result = try await service.share(conversationId: conversationId, body: makeBody())

        XCTAssertFalse(result.created)
        XCTAssertEqual(result.sharedTranslation, theirs)
    }

    func test_share_propagatesFailures() async {
        mock.errorToThrow = MeeshyError.network(.noConnection)

        do {
            _ = try await service.share(conversationId: conversationId, body: makeBody())
            XCTFail("Expected error to be thrown")
        } catch {
            XCTAssertEqual(mock.requestCount, 1)
        }
    }

    func test_share_whenTheAccountTurnedOffItsReadReceipts_throwsTheTypedRefusal() async {
        mock.errorToThrow = MeeshyError.forbidden(
            reason: "Read receipts are off",
            body: Data(#"{"success":false,"error":"Read receipts are off","code":"SHARED_TRANSLATION_READ_RECEIPTS_OFF"}"#.utf8)
        )

        do {
            _ = try await service.share(conversationId: conversationId, body: makeBody())
            XCTFail("Expected the refusal to be thrown")
        } catch {
            XCTAssertEqual(error as? SharedTranslationShareRefusal, .readReceiptsOff)
        }
    }

    func test_share_anyOtherForbidden_passesAsTheGatewayServedIt() async {
        mock.errorToThrow = MeeshyError.forbidden(
            reason: "Not a participant",
            body: Data(#"{"success":false,"error":"Not a participant"}"#.utf8)
        )

        do {
            _ = try await service.share(conversationId: conversationId, body: makeBody())
            XCTFail("Expected error to be thrown")
        } catch {
            XCTAssertNil(error as? SharedTranslationShareRefusal)
            guard case .forbidden(let reason, _)? = error as? MeeshyError else {
                return XCTFail("Expected the 403 as served, got \(error)")
            }
            XCTAssertEqual(reason, "Not a participant")
        }
    }

    func test_share_whenTheMessageChangedSinceTheTranslation_throwsTheTypedRefusal() async {
        mock.errorToThrow = staleSourceRejection()

        do {
            _ = try await service.share(conversationId: conversationId, body: makeBody())
            XCTFail("Expected the refusal to be thrown")
        } catch {
            XCTAssertEqual(error as? SharedTranslationShareRefusal, .staleSource)
        }
    }

    func test_share_aConflictWithAnotherCode_passesAsTheGatewayServedIt() async {
        mock.errorToThrow = staleSourceRejection(code: "SOMETHING_ELSE")

        do {
            _ = try await service.share(conversationId: conversationId, body: makeBody())
            XCTFail("Expected error to be thrown")
        } catch {
            XCTAssertNil(error as? SharedTranslationShareRefusal)
            guard case .rejected(let rejection)? = error as? MeeshyError else {
                return XCTFail("Expected the rejection as served, got \(error)")
            }
            XCTAssertEqual(rejection.code, "SOMETHING_ELSE")
        }
    }

    func test_share_aConflictWithoutACode_passesAsTheGatewayServedIt() async {
        mock.errorToThrow = staleSourceRejection(code: nil)

        do {
            _ = try await service.share(conversationId: conversationId, body: makeBody())
            XCTFail("Expected error to be thrown")
        } catch {
            XCTAssertNil(error as? SharedTranslationShareRefusal)
        }
    }

    func test_share_theTwoRefusalsKeepTheirOwnReach() async {
        mock.errorToThrow = MeeshyError.forbidden(
            reason: "Read receipts are off",
            body: Data(#"{"code":"SHARED_TRANSLATION_READ_RECEIPTS_OFF"}"#.utf8)
        )
        let accountRefusal = await refusal(of: makeBody())
        mock.errorToThrow = staleSourceRejection()
        let messageRefusal = await refusal(of: makeBody())

        XCTAssertEqual(accountRefusal, .readReceiptsOff)
        XCTAssertEqual(messageRefusal, .staleSource)
    }

    private func refusal(of body: ShareTranslationBody) async -> SharedTranslationShareRefusal? {
        do {
            _ = try await service.share(conversationId: conversationId, body: body)
            return nil
        } catch {
            return error as? SharedTranslationShareRefusal
        }
    }

    // MARK: - fetch

    func test_fetch_asksForTheMessagesAndLanguagesSeparatedByCommas() async throws {
        stubList([makeSharedTranslation()])

        let result = try await service.fetch(
            conversationId: conversationId,
            messageIds: ["64f0c0ffee0000000000a001", "64f0c0ffee0000000000a002"],
            languages: ["fr", "en"]
        )

        XCTAssertEqual(mock.lastRequest?.endpoint, route)
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        XCTAssertEqual(queryValue(mock.lastRequest, "messageIds"), "64f0c0ffee0000000000a001,64f0c0ffee0000000000a002")
        XCTAssertEqual(queryValue(mock.lastRequest, "languages"), "fr,en")
        XCTAssertEqual(result, [makeSharedTranslation()])
    }

    /// La passerelle EXIGE `languages` (1 à 8) : sans langue valable elle
    /// répondrait 400. Aucune requête ne part, la réponse est vide.
    func test_fetch_withoutLanguages_makesNoRequest() async throws {
        stubList([makeSharedTranslation()])

        let result = try await service.fetch(
            conversationId: conversationId, messageIds: ["64f0c0ffee0000000000a001"], languages: []
        )

        XCTAssertTrue(result.isEmpty)
        XCTAssertEqual(mock.requestCount, 0)
    }

    func test_fetch_withNoValidLanguage_makesNoRequest() async throws {
        stubList([makeSharedTranslation()])

        let result = try await service.fetch(
            conversationId: conversationId,
            messageIds: ["64f0c0ffee0000000000a001"],
            languages: ["français", "", "  ", "e"]
        )

        XCTAssertTrue(result.isEmpty)
        XCTAssertEqual(mock.requestCount, 0)
    }

    func test_queryItems_alwaysCarryBothParameters() {
        let items = SharedTranslationService.queryItems(messageIds: ["64f0c0ffee0000000000a001"], languages: ["fr"])

        XCTAssertEqual(items.map(\.name), ["messageIds", "languages"])
        XCTAssertEqual(items.map(\.value), ["64f0c0ffee0000000000a001", "fr"])
    }

    func test_fetch_dropsWhatTheGatewayWouldRefuse_beforeSending() async throws {
        stubList([])

        _ = try await service.fetch(
            conversationId: conversationId,
            messageIds: ["64f0c0ffee0000000000a001", "temp_42", "64f0c0ffee0000000000a001", " 64f0c0ffee0000000000a002 ", ""],
            languages: ["fr", "français", "fr", " en "]
        )

        XCTAssertEqual(queryValue(mock.lastRequest, "messageIds"), "64f0c0ffee0000000000a001,64f0c0ffee0000000000a002")
        XCTAssertEqual(queryValue(mock.lastRequest, "languages"), "fr,en")
    }

    func test_fetch_keepsAtMostEightLanguages() async throws {
        stubList([])
        let nine = ["fr", "en", "es", "de", "it", "pt", "ar", "ja", "ko"]

        _ = try await service.fetch(conversationId: conversationId, messageIds: ["64f0c0ffee0000000000a001"], languages: nine)

        XCTAssertEqual(queryValue(mock.lastRequest, "languages"), nine.prefix(8).joined(separator: ","))
    }

    func test_fetch_withNoValidMessage_makesNoRequest() async throws {
        let result = try await service.fetch(conversationId: conversationId, messageIds: ["temp_1", ""], languages: ["fr"])

        XCTAssertTrue(result.isEmpty)
        XCTAssertEqual(mock.requestCount, 0)
    }

    func test_fetch_sendsMoreThanAHundredMessagesInSuccessiveRequests() async throws {
        stubList([makeSharedTranslation()])
        let ids = (1...150).map(objectId)

        let result = try await service.fetch(conversationId: conversationId, messageIds: ids, languages: ["fr"])

        XCTAssertEqual(mock.requestCount, 2)
        XCTAssertEqual(mock.requests.map { queryValue($0, "messageIds")?.split(separator: ",").count }, [100, 50])
        XCTAssertEqual(result.count, 2)
    }

    func test_fetch_propagatesFailures() async {
        mock.errorToThrow = MeeshyError.network(.noConnection)

        do {
            _ = try await service.fetch(conversationId: conversationId, messageIds: ["64f0c0ffee0000000000a001"], languages: ["fr"])
            XCTFail("Expected error to be thrown")
        } catch {
            XCTAssertEqual(mock.requestCount, 1)
        }
    }
}
