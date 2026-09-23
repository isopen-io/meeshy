import XCTest
import GRDB
@testable import MeeshySDK

/// **Un éphémère perd son horloge en traversant GRDB** — la cause du « pas de
/// flamme chez le destinataire » (suite #7508, recette staging 2026-09-23).
///
/// Le fil temps réel ne porte PAS d'échéance pour un éphémère : `message:new`
/// est une diffusion de room, et l'échéance est par destinataire (contrat #7451
/// point 4 — `messageNewPayload.ts` sert `expiresAt: undefined` dès que
/// `ephemeralDuration` existe). **La DURÉE est donc le seul porteur d'horloge de
/// ce chemin**, et c'est elle que le client recompose avec sa réception locale.
///
/// Or le fil affiché ne vient JAMAIS de `APIMessage` : il vient de GRDB
/// (`ConversationViewModel+StoreObservation` → `MessageStore.domainMessages` →
/// `MessageRecord.toMessage`). Tout ce que la table `messages` ne porte pas est
/// perdu avant le premier pixel.
///
/// Ces témoins mesurent la chaîne PRODUIT — charge JSON réelle, décodeur de
/// production, acteur de persistance réel, projection réelle — jamais un
/// décodeur fabriqué pour l'occasion.
final class EphemeralDurationPersistenceTests: XCTestCase {

    private var dbQueue: DatabaseQueue!
    private var actor: MessagePersistenceActor!

    private static let conversationId = "6ab16c0b67c87be0efa9a50e"
    private static let messageId = "6ab37099918d1dc34001a94d"
    private static let senderId = "6a9e11d7c2b84f0193ac55e1"
    private static let reader = "6a9e11d7c2b84f0193ac55e2"

    override func setUp() async throws {
        dbQueue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: dbQueue)
        actor = MessagePersistenceActor(dbWriter: dbQueue)
    }

    override func tearDown() async throws {
        actor = nil
        dbQueue = nil
    }

    /// La charge `message:new` d'un éphémère, telle que la passerelle l'émet :
    /// le drapeau (`effectFlags: 1`) ET la durée, AUCUNE échéance.
    private static let socketPayload = """
    {"id":"\(messageId)","conversationId":"\(conversationId)","senderId":"\(senderId)",
     "content":"","messageType":"image","messageSource":"user",
     "isViewOnce":false,"isBlurred":false,
     "effectFlags":1,"ephemeralDuration":60,
     "isEncrypted":false,
     "createdAt":"2026-09-23T06:24:25.202Z","updatedAt":"2026-09-23T06:24:25.202Z"}
    """

    /// La même page servie par REST au DESTINATAIRE : elle porte `D(lecteur)`.
    private static func restPayload(expiresAt: String) -> String {
        """
        {"id":"\(messageId)","conversationId":"\(conversationId)","senderId":"\(senderId)",
         "content":"","messageType":"image","messageSource":"user",
         "isViewOnce":false,"isBlurred":false,
         "effectFlags":1,"ephemeralDuration":60,"expiresAt":"\(expiresAt)",
         "isEncrypted":false,
         "createdAt":"2026-09-23T06:24:25.202Z","updatedAt":"2026-09-23T06:24:25.202Z"}
        """
    }

    private func decode(_ json: String) throws -> APIMessage {
        try APIClient.makeAPIPayloadDecoder().decode(APIMessage.self, from: Data(json.utf8))
    }

    private func persistedMessage() throws -> MeeshyMessage {
        let rows = try actor.messages(for: Self.conversationId, limit: 10)
        let row = try XCTUnwrap(rows.first, "la ligne doit exister en base")
        return row.toMessage(currentUserId: Self.reader)
    }

    // MARK: - Le chemin temps réel

    /// **Le témoin de la cause.** Un éphémère arrivé par le socket, relu depuis
    /// GRDB comme le fil le relit, doit encore savoir quand il meurt.
    ///
    /// Sans la durée en base, `EphemeralDeadline.resolve` n'a AUCUNE source
    /// d'échéance : il rend `.notEphemeral`, `MessageProtectionDescriptor` ne
    /// pose aucun badge — pas de flamme — et `ephemeralDeadlines` (dont l'entrée
    /// est `ephemeralState.deadline`) reste vide, donc le balayage ne retire
    /// jamais rien.
    func test_ephemeralFromSocket_keepsItsClockAcrossPersistence() async throws {
        let api = try decode(Self.socketPayload)
        XCTAssertEqual(api.ephemeralDuration, 60, "le fil PORTE la durée")
        XCTAssertNil(api.expiresAt, "contrat #7451 point 4 : `message:new` ne porte aucune échéance")

        try await actor.upsertFromAPIMessages([api])
        let message = try persistedMessage()

        XCTAssertFalse(message.isMe, "le témoin se place chez le DESTINATAIRE")
        XCTAssertTrue(message.effects.flags.contains(.ephemeral), "le drapeau survit déjà à GRDB")
        XCTAssertEqual(
            message.effects.ephemeralDuration, 60,
            "la DURÉE doit survivre à GRDB — c'est le seul porteur d'horloge du temps réel"
        )

        let receivedAt = Date()
        let protection = message.protection(
            ledger: StubReceiptLedger(reception: receivedAt),
            now: receivedAt.addingTimeInterval(5)
        )

        XCTAssertEqual(
            protection.ephemeralState,
            .imminent(deadline: receivedAt.addingTimeInterval(60)),
            "l'horloge démarre à la réception LOCALE, la seule que ce chemin connaisse"
        )
        XCTAssertEqual(
            protection.badges, [.ephemeral(.imminent(deadline: receivedAt.addingTimeInterval(60)))],
            "aucun badge ⇒ aucune flamme, exactement le symptôme mesuré en recette"
        )
        XCTAssertNotNil(
            protection.ephemeralState.deadline,
            "sans échéance, le message n'entre dans AUCUN balayage — il n'est jamais détruit"
        )
    }

    // MARK: - Le rattrapage REST

    /// **L'échéance SERVIE doit pouvoir atteindre une ligne DÉJÀ écrite.**
    ///
    /// Le temps réel écrit la ligne en premier, sans échéance (contrat ci-dessus).
    /// La revalidation REST qui suit apporte `D(lecteur)` — et tombe donc dans la
    /// branche « ligne existante » de l'upsert. Une branche qui n'y recopie pas
    /// `expiresAt` condamne la ligne à ignorer l'échéance du serveur pour
    /// toujours.
    func test_restRefresh_bringsTheServedDeadlineToAnExistingRow() async throws {
        try await actor.upsertFromAPIMessages([try decode(Self.socketPayload)])
        XCTAssertNil(try persistedMessage().expiresAt, "le socket n'a servi aucune échéance")

        let served = "2026-09-23T06:25:25.300Z"
        try await actor.upsertFromAPIMessages([try decode(Self.restPayload(expiresAt: served))])

        XCTAssertEqual(
            try persistedMessage().expiresAt, WireDate.date(from: served),
            "l'échéance servie par REST doit rejoindre la ligne écrite par le socket"
        )
    }
}

/// Registre de réception injecté — le vrai vit dans les `UserDefaults` du
/// groupe d'application et ferait dépendre le témoin de l'état de la machine.
private struct StubReceiptLedger: EphemeralReceiptRecording {
    let reception: Date
    func firstReception(of messageId: String) -> Date? { reception }
    @discardableResult
    func noteReception(of messageId: String, at date: Date) -> Date { reception }
}
