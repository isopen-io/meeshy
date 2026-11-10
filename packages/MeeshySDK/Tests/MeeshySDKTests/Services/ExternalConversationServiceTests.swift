import XCTest
@testable import MeeshySDK

/// #17118 — `POST /conversations/external` (#17117) : `{ network, handle }` et
/// RIEN d'autre (le schéma Zod de la passerelle est strict). Le service rend
/// l'issue que l'écran dessine, jamais une erreur brute.
final class ExternalConversationServiceTests: XCTestCase {

    private static let path = "/conversations/external"

    private func makeSUT() -> (service: ExternalConversationService, api: MockAPIClient) {
        let api = MockAPIClient()
        return (ExternalConversationService(api: api), api)
    }

    private func stubOpening(_ api: MockAPIClient, created: Bool) {
        api.stub(Self.path, result: APIResponse<ExternalOpening>(
            success: true,
            data: ExternalOpening(conversationId: "c1", type: "external", encryptionMode: "e2ee", network: "whatsapp", created: created),
            error: nil))
    }

    func test_open_postsOnlyTheNetworkAndTheHandle() async {
        let (service, api) = makeSUT()
        stubOpening(api, created: true)

        _ = await service.open(network: .whatsapp, handle: "+33612345678")

        XCTAssertEqual(api.lastRequest?.endpoint, Self.path)
        XCTAssertEqual(api.lastRequest?.method, "POST")
        XCTAssertEqual(api.lastRequest?.bodyJSON?["network"] as? String, "whatsapp")
        XCTAssertEqual(api.lastRequest?.bodyJSON?["handle"] as? String, "+33612345678")
        XCTAssertEqual(api.lastRequest?.bodyJSON?.count, 2)
    }

    func test_open_readsTheRefusalCodes() async {
        let (service, api) = makeSUT()
        stubOpening(api, created: true)

        _ = await service.open(network: .whatsapp, handle: "+33612345678")

        XCTAssertEqual(api.lastRequest?.rejectionPolicy, .structured)
    }

    func test_open_newConversation_opensIt() async {
        let (service, api) = makeSUT()
        stubOpening(api, created: true)

        let outcome = await service.open(network: .whatsapp, handle: "+33612345678")

        XCTAssertEqual(outcome, .open(conversationId: "c1", created: true))
    }

    func test_open_existingConversation_findsItAgain() async {
        let (service, api) = makeSUT()
        stubOpening(api, created: false)

        let outcome = await service.open(network: .whatsapp, handle: "+33612345678")

        XCTAssertEqual(outcome, .open(conversationId: "c1", created: false))
    }

    func test_open_unverifiedPhone_saysSo() async {
        let (service, api) = makeSUT()
        api.errorToThrow = MeeshyError.forbidden(
            reason: "refus",
            body: Data(#"{"success":false,"error":"refus","code":"EXTERNAL_CONVERSATION_PHONE_UNVERIFIED"}"#.utf8))

        let outcome = await service.open(network: .whatsapp, handle: "+33612345678")

        XCTAssertEqual(outcome, .phoneUnverified)
    }

    func test_open_offline_saysSo() async {
        let (service, api) = makeSUT()
        api.errorToThrow = URLError(.notConnectedToInternet)

        let outcome = await service.open(network: .whatsapp, handle: "+33612345678")

        XCTAssertEqual(outcome, .refused(.offline))
    }
}
