import XCTest
import GRDB
@testable import MeeshySDK

/// **#6793 — les réactions d'une PIÈCE remontent du serveur jusqu'à la bulle.**
///
/// Directive porteur 2026-09-16 : « Les reactions des medias doivent etre
/// remonté et affiché sur les medias dans les conversations ! »
///
/// Le serveur les servait (`aggregateAttachmentReactions`,
/// `routes/conversations/messages-list-query.ts`). Le client les jetait, à DEUX
/// endroits : les deux projections `APIMessageAttachment → MeeshyMessageAttachment`
/// qui alimentent le fil recopient champ par champ, et aucune des deux ne
/// nommait `reactionSummary` ni `currentUserReactions`. La seule surface qui
/// affiche ces réactions — la tuile de la bulle — ne voyait donc jamais que ce
/// que l'appareil venait d'écrire lui-même, en optimiste.
///
/// **C'est le NIVEAU de test qui manquait, pas un cas.** Chacune des deux
/// projections, prise seule, est cohérente avec elle-même ; le trou n'est
/// visible qu'en suivant la donnée du PAYLOAD jusqu'au `Message` relu. Un
/// unitaire de mapping ne l'aurait pas vu, et n'en a rien vu pendant tout le
/// temps où le défaut a vécu.
final class AttachmentReactionPersistenceTests: XCTestCase {

    private var actor: MessagePersistenceActor!
    private var dbQueue: DatabaseQueue!

    override func setUp() async throws {
        dbQueue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: dbQueue)
        actor = MessagePersistenceActor(dbWriter: dbQueue)
    }

    /// Le décodeur est celui de la PRODUCTION (`APIClient.makeAPIPayloadDecoder`) :
    /// un `.iso8601` nu refuserait les fractions de seconde du gateway — un
    /// témoin qui fabrique son décodeur mesure le RUNTIME, pas la règle.
    private func makeAPIMessage(reactions: [String: Int]?, mine: [String]?) throws -> APIMessage {
        var piece: [String: Any] = [
            "id": "att_1",
            "fileName": "photo.jpg",
            "originalName": "photo.jpg",
            "mimeType": "image/jpeg",
            "fileSize": 1024,
            "fileUrl": "https://example.test/photo.jpg",
        ]
        if let reactions { piece["reactionSummary"] = reactions }
        if let mine { piece["currentUserReactions"] = mine }

        let json: [String: Any] = [
            "id": "srv_react",
            "conversationId": "conv_react",
            "senderId": "sender_1",
            "content": "",
            "createdAt": "2026-09-16T08:00:00.000Z",
            "updatedAt": "2026-09-16T08:00:00.000Z",
            "attachments": [piece],
        ]
        let data = try JSONSerialization.data(withJSONObject: json)
        return try APIClient.makeAPIPayloadDecoder().decode(APIMessage.self, from: data)
    }

    // MARK: - Le chemin du CACHE — celui que la liste des bulles relit

    /// Le fil ROUVERT porte les réactions que le serveur sert. C'est le défaut
    /// exact : on relançait l'app à froid et la tuile restait nue alors que la
    /// passerelle renvoyait `{'✨': 1, '🔥': 1}`.
    func test_upsertFromAPIMessages_carriesAttachmentReactionsToTheReadBackMessage() async throws {
        let api = try makeAPIMessage(reactions: ["✨": 1, "🔥": 2], mine: ["🔥"])

        try await actor.upsertFromAPIMessages([api])

        let row = try XCTUnwrap(
            try actor.messages(for: "conv_react", limit: 10).first { $0.serverId == "srv_react" }
        )
        let piece = try XCTUnwrap(row.toMessage(currentUserId: "user_me").attachments.first)
        XCTAssertEqual(piece.reactionSummary, ["✨": 1, "🔥": 2])
        XCTAssertEqual(piece.currentUserReactions, ["🔥"])
    }

    /// Une pièce sans réaction ne fabrique pas un résumé vide : `nil` et `[:]`
    /// ne disent pas la même chose à la pastille, qui n'existe qu'au premier
    /// émoji (loi 4).
    func test_aPieceWithoutReactions_carriesNothing() async throws {
        let api = try makeAPIMessage(reactions: nil, mine: nil)

        try await actor.upsertFromAPIMessages([api])

        let row = try XCTUnwrap(
            try actor.messages(for: "conv_react", limit: 10).first { $0.serverId == "srv_react" }
        )
        let piece = try XCTUnwrap(row.toMessage(currentUserId: "user_me").attachments.first)
        XCTAssertNil(piece.reactionSummary)
        XCTAssertNil(piece.currentUserReactions)
    }

    // MARK: - Le chemin DIRECT — `APIMessage.toMessage`, sans passer par GRDB

    /// La seconde projection, celle que le socket et le chemin REST direct
    /// empruntent. Elle avait le même trou, et les deux devaient tomber
    /// ensemble : corriger l'une aurait laissé l'autre servir une pièce nue au
    /// premier chemin qui l'emprunte.
    func test_apiMessageToMessage_carriesAttachmentReactions() throws {
        let api = try makeAPIMessage(reactions: ["👍": 3], mine: ["👍"])

        let piece = try XCTUnwrap(api.toMessage(currentUserId: "user_me").attachments.first)

        XCTAssertEqual(piece.reactionSummary, ["👍": 3])
        XCTAssertEqual(piece.currentUserReactions, ["👍"])
    }

    // MARK: - L'inventaire des projections

    /// **Les TROIS projections d'une pièce d'API portent ses réactions.**
    ///
    /// Une garde d'inventaire, et c'est la seule forme qui morde ici : chaque
    /// projection, prise seule, compile et se tient. Ce qui manquait était un
    /// CHAMP, et un champ absent d'une recopie ne fait rougir personne — il
    /// rend juste une pièce muette sur une surface qu'aucun témoin de cette
    /// projection ne regarde.
    ///
    /// La liste NOMME les trois sites plutôt que de les chercher : un
    /// quatrième naîtra un jour, et le prix à payer pour l'ajouter ici — se
    /// demander s'il porte les réactions — est exactement le prix qu'on veut
    /// qu'il coûte.
    func test_everyApiAttachmentProjection_carriesTheReactions() throws {
        let sources = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Persistence
            .deletingLastPathComponent()   // MeeshySDKTests
            .deletingLastPathComponent()   // Tests
            .deletingLastPathComponent()   // MeeshySDK
            .appendingPathComponent("Sources/MeeshySDK")

        let projections = [
            "Models/MessageModels.swift",        // APIMessage.toMessage — socket et REST direct
            "Models/ConversationModels.swift",   // dernier message de la liste de conversations
            "Persistence/MessagePersistenceActor.swift", // REST → GRDB, ce que la bulle relit
        ]

        for chemin in projections {
            let code = try String(contentsOf: sources.appendingPathComponent(chemin), encoding: .utf8)
            XCTAssertTrue(code.contains("reactionSummary: apiAtt.reactionSummary"),
                          "\(chemin) projette une pièce SANS son résumé de réactions")
            XCTAssertTrue(code.contains("currentUserReactions: apiAtt.currentUserReactions"),
                          "\(chemin) projette une pièce sans dire si le lecteur y a réagi")
        }
    }
}
