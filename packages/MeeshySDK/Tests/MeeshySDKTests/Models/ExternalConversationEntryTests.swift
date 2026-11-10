import Testing
import Foundation
@testable import MeeshySDK

/// #17118 — écrire à un ami WhatsApp depuis iOS : ce que l'appareil décide AVANT
/// et APRÈS `POST /conversations/external` (#17117), sans rien rendre.
///
/// Trois règles, chacune avec son témoin :
/// 1. l'entrée n'existe qu'AVANT la signature avec Meta, donc jamais contre la
///    passerelle de production, et seulement pour l'ÉQUIPE (design § 6) ;
/// 2. le numéro part en E.164 sans qu'aucun indicatif ne soit DEVINÉ — écrire
///    au mauvais pays adresserait un message à un inconnu ;
/// 3. chaque réponse devient un état que l'écran sait dire, et une réponse
///    « ouverte » qui n'annonce pas une conversation externe chiffrée de bout
///    en bout n'ouvre RIEN.
@Suite("Conversation externe — entrée, numéro et issue d'une ouverture")
struct ExternalConversationEntryTests {

    // MARK: - 1. L'entrée : avant la signature, et pour l'équipe

    @Test("La passerelle de production ne reçoit jamais l'entrée, même pour l'équipe")
    func production_isClosed() {
        #expect(ExternalConversationEntry.isReachable(apiBaseURL: "https://gate.meeshy.me/api/v1") == false)
        #expect(ExternalConversationEntry.isVisible(apiBaseURL: "https://gate.meeshy.me/api/v1", role: "BIGBOSS") == false)
    }

    @Test("Le staging, localhost, une IPv4 et un hôte sans point sont ouverts")
    func preSignatureGateways_areReachable() {
        #expect(ExternalConversationEntry.isReachable(apiBaseURL: "https://gate.staging.meeshy.me/api/v1"))
        #expect(ExternalConversationEntry.isReachable(apiBaseURL: "http://localhost:3000/api/v1"))
        #expect(ExternalConversationEntry.isReachable(apiBaseURL: "http://192.168.1.12:3000/api/v1"))
        #expect(ExternalConversationEntry.isReachable(apiBaseURL: "http://meeshy-mac:3000/api/v1"))
    }

    @Test("Un hôte inconnu ou une adresse illisible restent fermés (liste POSITIVE)")
    func unknownGateways_areClosed() {
        #expect(ExternalConversationEntry.isReachable(apiBaseURL: "https://gate.example.com/api/v1") == false)
        #expect(ExternalConversationEntry.isReachable(apiBaseURL: "https://staging.meeshy.me.evil.io/api/v1") == false)
        #expect(ExternalConversationEntry.isReachable(apiBaseURL: "") == false)
        #expect(ExternalConversationEntry.isReachable(apiBaseURL: "pas une adresse") == false)
    }

    @Test("Au staging, seule l'équipe voit l'entrée : MODERATOR et au-dessus")
    func staging_offersTheEntryToTheTeamOnly() {
        let staging = "https://gate.staging.meeshy.me/api/v1"
        #expect(ExternalConversationEntry.isVisible(apiBaseURL: staging, role: "MODERATOR"))
        #expect(ExternalConversationEntry.isVisible(apiBaseURL: staging, role: "ADMIN"))
        #expect(ExternalConversationEntry.isVisible(apiBaseURL: staging, role: "USER") == false)
        #expect(ExternalConversationEntry.isVisible(apiBaseURL: staging, role: "AUDIT") == false)
        #expect(ExternalConversationEntry.isVisible(apiBaseURL: staging, role: nil) == false)
    }

    // MARK: - 2. Le numéro, en E.164

    @Test("Les séparateurs usuels tombent et 00 vaut +")
    func normalize_dropsSeparatorsAndReadsDoubleZero() {
        #expect(ExternalConversationEntry.normalizeHandle(" +33 6 12-34.56(78) ") == "+33612345678")
        #expect(ExternalConversationEntry.normalizeHandle("0033612345678") == "+33612345678")
    }

    @Test("Un numéro national n'est jamais complété d'un indicatif deviné")
    func normalize_neverGuessesACountry() {
        #expect(ExternalConversationEntry.normalizeHandle("06 12 34 56 78") == nil)
    }

    @Test("Ce qui n'est pas un numéro E.164 est refusé avant tout envoi")
    func normalize_refusesWhatIsNotE164() {
        #expect(ExternalConversationEntry.normalizeHandle("") == nil)
        #expect(ExternalConversationEntry.normalizeHandle("+0612345678") == nil)
        #expect(ExternalConversationEntry.normalizeHandle("+3361234567890123") == nil)
        #expect(ExternalConversationEntry.normalizeHandle("+33 6 12 ab 56 78") == nil)
    }

    // MARK: - 3. L'issue d'une ouverture

    private static func opening(type: String = "external", encryptionMode: String = "e2ee", id: String = "c1", created: Bool = true) -> ExternalOpening {
        ExternalOpening(conversationId: id, type: type, encryptionMode: encryptionMode, network: "whatsapp", created: created)
    }

    @Test("Une conversation externe chiffrée s'ouvre, neuve ou retrouvée")
    func sealedOpening_opens() {
        #expect(ExternalOpeningOutcome.of(Self.opening()) == .open(conversationId: "c1", created: true))
        #expect(ExternalOpeningOutcome.of(Self.opening(created: false)) == .open(conversationId: "c1", created: false))
    }

    @Test("Une réponse qui ne dit pas external + e2ee n'ouvre rien")
    func unsealedOpening_opensNothing() {
        #expect(ExternalOpeningOutcome.of(Self.opening(type: "direct")) == .refused(.failed))
        #expect(ExternalOpeningOutcome.of(Self.opening(encryptionMode: "server")) == .refused(.failed))
        #expect(ExternalOpeningOutcome.of(Self.opening(id: "")) == .refused(.failed))
    }

    private static func forbidden(code: String) -> MeeshyError {
        .forbidden(reason: "refus", body: Data(#"{"success":false,"error":"refus","code":"\#(code)"}"#.utf8))
    }

    private static func rejected(_ status: Int, code: String?) -> MeeshyError {
        .rejected(APIRejection(statusCode: status, code: code, message: "refus"))
    }

    @Test("Le numéro non vérifié a son propre état : la vérification se propose")
    func phoneUnverified_isItsOwnState() {
        #expect(ExternalOpeningOutcome.of(error: Self.forbidden(code: ExternalConversationErrorCode.phoneUnverified)) == .phoneUnverified)
    }

    @Test("Chaque code du contrat devient son refus")
    func everyContractCode_becomesItsRefusal() {
        #expect(ExternalOpeningOutcome.of(error: Self.forbidden(code: ExternalConversationErrorCode.disabled)) == .refused(.disabled))
        #expect(ExternalOpeningOutcome.of(error: Self.forbidden(code: ExternalConversationErrorCode.endToEndReserved)) == .refused(.reserved))
        #expect(ExternalOpeningOutcome.of(error: Self.rejected(409, code: ExternalConversationErrorCode.limitReached)) == .refused(.limit))
        #expect(ExternalOpeningOutcome.of(error: Self.rejected(400, code: ExternalConversationErrorCode.invalid)) == .refused(.invalid))
    }

    @Test("Une passerelle d'avant #17117 (404) dit « pas encore disponible ici »")
    func unknownRoute_readsAsDisabled() {
        #expect(ExternalOpeningOutcome.of(error: Self.rejected(404, code: nil)) == .refused(.disabled))
        #expect(ExternalOpeningOutcome.of(error: MeeshyError.server(statusCode: 404, message: "Not Found")) == .refused(.disabled))
    }

    @Test("Le débit, l'absence de réseau et la panne ont chacun leur état")
    func throttleOfflineAndFailure_areDistinct() {
        #expect(ExternalOpeningOutcome.of(error: MeeshyError.server(statusCode: 429, message: "Trop de requetes")) == .refused(.rateLimited))
        #expect(ExternalOpeningOutcome.of(error: MeeshyError.network(.noConnection)) == .refused(.offline))
        #expect(ExternalOpeningOutcome.of(error: URLError(.notConnectedToInternet)) == .refused(.offline))
        #expect(ExternalOpeningOutcome.of(error: MeeshyError.server(statusCode: 500, message: "boom")) == .refused(.failed))
        #expect(ExternalOpeningOutcome.of(error: Self.forbidden(code: "AUTRE_CHOSE")) == .refused(.failed))
    }

    // MARK: - 4. La conversation servie

    private static func served(type: String) throws -> MeeshyConversation {
        let payload: [String: Any] = [
            "id": "c1",
            "identifier": "ext_c1",
            "type": type,
            "encryptionMode": "e2ee",
            "createdAt": "2026-11-10T10:00:00Z",
            "participants": [["id": "p1", "userId": "moi", "displayName": "Moi"]],
        ]
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let api = try decoder.decode(APIConversation.self, from: JSONSerialization.data(withJSONObject: payload))
        return api.toConversation(currentUserId: "moi")
    }

    @Test("Une conversation externe porte le nom du réseau, jamais ext_<id> ni le nom du lecteur")
    func externalConversation_isNamedAfterTheNetwork() throws {
        let conversation = try Self.served(type: "external")
        #expect(conversation.isExternal)
        #expect(conversation.externalNetwork == .whatsapp)
        #expect(conversation.name == "WhatsApp")
        #expect(conversation.type == .direct)
    }

    @Test("Une conversation Meeshy-Meeshy n'est jamais externe")
    func meeshyConversation_isNeverExternal() throws {
        #expect(try Self.served(type: "direct").isExternal == false)
        #expect(try Self.served(type: "group").isExternal == false)
    }

    @Test("La marque externe survit au cache (aller-retour Codable)")
    func externalMark_survivesTheCache() throws {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let revived = try decoder.decode(MeeshyConversation.self, from: encoder.encode(try Self.served(type: "external")))
        #expect(revived.externalNetwork == .whatsapp)
    }
}
