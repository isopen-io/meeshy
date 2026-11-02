import XCTest
@testable import MeeshySDK

/// Le chiffrement d'une conversation s'ACTIVE (#12522) et le bout en bout ne se
/// désactive pas (#12949) : le service lit et active le régime, l'époque voyage
/// avec un envoi libsignal, et un événement socket repeint la conversation sans
/// relecture — jamais vers le clair depuis le bout en bout.
final class ConversationEncryptionRegimeTests: XCTestCase {

    private func makeSUT() -> (sut: ConversationEncryptionService, api: MockAPIClient) {
        let api = MockAPIClient()
        return (ConversationEncryptionService(api: api), api)
    }

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try MeeshyCoders.decoder(.api).decode(T.self, from: Data(json.utf8))
    }

    private func status(_ json: String) throws -> APIResponse<ConversationEncryptionStatus> {
        try decode(APIResponse<ConversationEncryptionStatus>.self, json)
    }

    // MARK: - Service

    func test_fetchStatus_readsEpochAndToggleRight() async throws {
        let (sut, api) = makeSUT()
        api.stub("/conversations/c1/encryption-status", result: try status("""
        {"success":true,"data":{"isEncrypted":true,"mode":"e2ee","enabledAt":"2026-10-24T08:00:00.000Z","enabledBy":"u1","canTranslate":false,"epoch":3,"canToggleEncryption":true}}
        """))

        let result = try await sut.fetchStatus(conversationId: "c1")

        XCTAssertEqual(api.lastRequest?.method, "GET")
        XCTAssertEqual(result.mode, "e2ee")
        XCTAssertEqual(result.epoch, 3)
        XCTAssertEqual(result.canToggleEncryption, true)
        XCTAssertTrue(result.isEndToEnd)
    }

    func test_fetchStatus_fromAnOlderGateway_leavesEpochAndRightUnknown() async throws {
        let (sut, api) = makeSUT()
        api.stub("/conversations/c1/encryption-status", result: try status("""
        {"success":true,"data":{"isEncrypted":false,"mode":null,"enabledAt":null,"enabledBy":null,"canTranslate":false}}
        """))

        let result = try await sut.fetchStatus(conversationId: "c1")

        XCTAssertNil(result.epoch)
        XCTAssertNil(result.canToggleEncryption)
        XCTAssertFalse(result.isEndToEnd)
    }

    func test_enable_postsTheModeAndReturnsTheNewRegime() async throws {
        let (sut, api) = makeSUT()
        api.stub("/conversations/c1/encryption", result: try status("""
        {"success":true,"data":{"isEncrypted":true,"mode":"e2ee","enabledAt":"2026-10-24T08:00:00.000Z","enabledBy":"u1","canTranslate":false,"epoch":1,"canToggleEncryption":true}}
        """))

        let result = try await sut.enable(conversationId: "c1", mode: "e2ee")

        XCTAssertEqual(api.lastRequest?.method, "POST")
        XCTAssertEqual(api.lastRequest?.bodyJSON?["mode"] as? String, "e2ee")
        XCTAssertEqual(result.epoch, 1)
    }

    /// Le chiffrement AU REPOS se désactive encore (#12522) ; la passerelle
    /// refuse la désactivation d'un bout en bout (#12949).
    func test_disable_deletesTheAtRestRegimeAndReturnsItInClear() async throws {
        let (sut, api) = makeSUT()
        api.stub("/conversations/c1/encryption", result: try status("""
        {"success":true,"data":{"isEncrypted":false,"mode":null,"enabledAt":null,"enabledBy":null,"canTranslate":true,"epoch":2,"canToggleEncryption":true}}
        """))

        let result = try await sut.disable(conversationId: "c1")

        XCTAssertEqual(api.lastRequest?.method, "DELETE")
        XCTAssertFalse(result.isEncrypted)
        XCTAssertEqual(result.epoch, 2)
    }

    // MARK: - L'autre tête-à-tête de la paire (#12966)

    func test_openReadableDirect_asksTheReadableOneOfThePair() async throws {
        let (sut, api) = makeSUT()
        api.stub("/conversations", result: try decode(APIResponse<CreateConversationResponse>.self, """
        {"success":true,"data":{"id":"c-readable","type":"direct","title":null,"createdAt":"2026-10-25T10:00:00.000Z"}}
        """))

        let opened = try await sut.openReadableDirect(with: "u-peer")

        XCTAssertEqual(opened, "c-readable")
        XCTAssertEqual(api.lastRequest?.method, "POST")
        XCTAssertEqual(api.lastRequest?.bodyJSON?["type"] as? String, "direct")
        XCTAssertEqual(api.lastRequest?.bodyJSON?["participantIds"] as? [String], ["u-peer"])
        XCTAssertEqual(api.lastRequest?.bodyJSON?["plaintext"] as? Bool, true)
    }

    func test_createConversationRequest_withoutPlaintext_staysTheBodyOfBefore() throws {
        let body = try JSONSerialization.jsonObject(with: JSONEncoder().encode(CreateConversationRequest(type: "direct", participantIds: ["u"]))) as? [String: Any]

        XCTAssertNil(body?["plaintext"], "un ancien appel ne change pas de forme (#9223)")
    }

    func test_status_readsThePairEndToEndConversation() throws {
        let served = try status("""
        {"success":true,"data":{"isEncrypted":false,"mode":null,"canTranslate":true,"epoch":0,"canToggleEncryption":false,"pairEndToEndConversationId":"c-e2ee"}}
        """).data

        XCTAssertEqual(served.pairEndToEndConversationId, "c-e2ee")
        XCTAssertEqual(served.canToggleEncryption, false)
    }

    // MARK: - Fil

    func test_libsignalWireMetadata_carriesTheRegimeEpochItWasSealedUnder() throws {
        let sealed = try JSONSerialization.jsonObject(with: JSONEncoder().encode(E2EEWireMetadata(senderDeviceId: 2, regimeEpoch: 5))) as? [String: Any]
        let unknown = try JSONSerialization.jsonObject(with: JSONEncoder().encode(E2EEWireMetadata(senderDeviceId: 2))) as? [String: Any]

        XCTAssertEqual(sealed?["regimeEpoch"] as? Int, 5)
        XCTAssertNil(unknown?["regimeEpoch"])
    }

    // MARK: - Événement socket

    private let changedJSON = """
    {"conversationId":"c1","isEncrypted":false,"mode":null,"epoch":4,"changedByUserId":"u1","changedAt":"2026-10-25T10:00:00.000Z"}
    """

    func test_encryptionChangedEvent_decodesTheGatewayPayload() throws {
        let event = try decode(ConversationEncryptionChangedEvent.self, changedJSON)

        XCTAssertEqual(event.conversationId, "c1")
        XCTAssertNil(event.mode)
        XCTAssertEqual(event.epoch, 4)
        XCTAssertFalse(event.isEncrypted)
    }

    /// #12949 — le bout en bout ne se désactive pas : une bascule servie vers
    /// le clair ne repeint jamais une conversation chiffrée de bout en bout.
    func test_adoptingEncryption_neverRepaintsAnEndToEndConversationInClear() throws {
        let event = try decode(ConversationEncryptionChangedEvent.self, changedJSON)
        var conversation = MeeshyConversation(id: "c1", identifier: "c1")
        conversation.encryptionMode = "e2ee"
        conversation.encryptionEnabledAt = Date(timeIntervalSince1970: 1_000)

        XCTAssertNil(conversation.adoptingEncryption(event))
    }

    /// Le chiffrement AU REPOS se quitte encore : la passerelle le lit déjà.
    func test_adoptingEncryption_repaintsAServerEncryptedConversationInClear() throws {
        let event = try decode(ConversationEncryptionChangedEvent.self, changedJSON)
        var conversation = MeeshyConversation(id: "c1", identifier: "c1")
        conversation.encryptionMode = "server"

        let adopted = conversation.adoptingEncryption(event)

        XCTAssertNotNil(adopted)
        XCTAssertNil(adopted?.encryptionMode)
    }

    /// #12936 — une activation servie dans le futur est bornée par l'horloge de l'appareil.
    func test_regime_anActivationServedInTheFuture_isBoundedByTheDeviceClock() throws {
        var conversation = MeeshyConversation(id: "c1", identifier: "c1")
        conversation.encryptionMode = "e2ee"
        conversation.encryptionEnabledAt = Date().addingTimeInterval(365 * 86_400)

        let regime = EndToEndRegime(conversation: conversation)

        XCTAssertLessThanOrEqual(try XCTUnwrap(regime.enabledAt), Date())
        XCTAssertTrue(regime.governs(createdAt: Date()))
    }

    func test_adoptingEncryption_ignoresAnotherConversationAndAnUnchangedRegime() throws {
        let event = try decode(ConversationEncryptionChangedEvent.self, changedJSON)
        let other = MeeshyConversation(id: "c2", identifier: "c2")
        let alreadyClear = MeeshyConversation(id: "c1", identifier: "c1")

        XCTAssertNil(other.adoptingEncryption(event))
        XCTAssertNil(alreadyClear.adoptingEncryption(event))
    }

    func test_adoptingEncryption_startsTheEndToEndEraAtTheSwitch() throws {
        let event = try decode(ConversationEncryptionChangedEvent.self, """
        {"conversationId":"c1","isEncrypted":true,"mode":"e2ee","epoch":5,"changedByUserId":"u1","changedAt":"2026-10-25T10:00:00.000Z"}
        """)
        let conversation = MeeshyConversation(id: "c1", identifier: "c1")

        let adopted = conversation.adoptingEncryption(event)

        XCTAssertEqual(adopted?.encryptionMode, "e2ee")
        XCTAssertNotNil(event.changedAtDate)
        XCTAssertEqual(adopted?.encryptionEnabledAt, event.changedAtDate)
    }
}
