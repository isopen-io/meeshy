import XCTest
import MeeshySDK
@testable import Meeshy

/// Le contrat entre le kit et l'app : l'échantillon EXPORTÉ par le kit se décode avec le
/// décodeur de PRODUCTION. Un champ Swift renommé fait rougir ce témoin, jamais une capture.
final class VitrineFixturesTests: XCTestCase {
    private var echantillon: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Resources/VitrineFixtures-fr.json")
    }

    func test_decoder_kitSample_readsEveryDomain() throws {
        let f = try VitrineFixtures.decoder(Data(contentsOf: echantillon))
        XCTAssertEqual(f.version, 2)
        XCTAssertEqual(f.lang, "fr")
        XCTAssertEqual(f.lecteur.username, "lea.mtn")
        XCTAssertEqual(f.lecteur.systemLanguage, "fr")
        let global = try XCTUnwrap(f.conversations.first { $0.type == "global" })
        XCTAssertEqual(global.identifier, "meeshy")
        XCTAssertEqual(f.modesDeLecture[global.id], "script")
        let messages = try XCTUnwrap(f.messages[global.id])
        XCTAssertGreaterThan(messages.count, 5)
        XCTAssertTrue(messages.contains { $0.joinNotice != nil }, "Aucun avis d'arrivée décodé.")
        XCTAssertTrue(messages.contains { ($0.translations ?? []).contains { $0.targetLanguage == "fr" } })
        XCTAssertEqual(f.progression.streak.currentStreakDays, 7)
        XCTAssertEqual(f.lienInvitation.linkId, "lisboa-2026")
        XCTAssertFalse(f.lienInvitation.requireAccount)
    }

    /// Les champs OPTIONNELS que les scènes affichent : un renommage côté Swift les jetterait sans
    /// la moindre erreur de décodage, et l'écran se viderait en silence.
    func test_decoder_kitSample_keepsTheOptionalFieldsTheScenesShow() throws {
        let f = try VitrineFixtures.decoder(Data(contentsOf: echantillon))
        let global = try XCTUnwrap(f.conversations.first { $0.type == "global" })
        XCTAssertEqual(global.lastMessageOriginalLanguage, "ko")
        XCTAssertNotNil(global.lastMessageTranslations?["fr"], "Aperçu de liste sans Prisme.")
        XCTAssertEqual(f.conversations.first { $0.title == "Lisboa ✈️" }?.unreadCount, 4)
        for direct in f.conversations where direct.type == "direct" {
            XCTAssertEqual(direct.participants?.count, 2, "Conversation directe sans ses deux membres.")
        }
        XCTAssertNotNil(f.progression.meesh?.firstMintedAt, "Progression sans Meesh.")
        XCTAssertEqual(f.progression.elan?.factor, 3, "Progression sans Élan.")
        XCTAssertEqual(f.lienInvitation.name, "Lisboa ✈️")
    }

    /// Des fixtures du lot 1 oubliées dans le conteneur : la vitrine refuse plutôt que d'ouvrir un écran vide.
    func test_decoder_previousVersion_throwsVersionInconnue() throws {
        var brut = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: echantillon)) as? [String: Any])
        brut["version"] = 1
        let data = try JSONSerialization.data(withJSONObject: brut)
        XCTAssertThrowsError(try VitrineFixtures.decoder(data)) { erreur in
            XCTAssertEqual(erreur as? VitrineFixturesErreur, .versionInconnue(1))
        }
    }

    /// Le lot 2 : le vocal et sa piste dans la langue du lecteur, les destinations, le fil et les médias.
    func test_decoder_kitSample_readsTheConversationsOfLot2() throws {
        let f = try VitrineFixtures.decoder(Data(contentsOf: echantillon))
        let amour = try XCTUnwrap(f.scenes["amour"])
        let vocal = try XCTUnwrap(f.messages[amour.conversationId]?.first { $0.id == amour.messageId })
        let piece = try XCTUnwrap(vocal.attachments?.first { $0.id == amour.attachmentId })
        XCTAssertEqual(piece.transcription?.language, "ko")
        let piste = try XCTUnwrap(piece.translations?["fr"], "Vocal sans piste dans la langue de la lectrice.")
        XCTAssertGreaterThan(piste.segments?.count ?? 0, 3, "Piste sans karaoké.")
        XCTAssertTrue(f.medias.contains { $0.genre == .audio && $0.url == piste.url })
        XCTAssertEqual(f.modesDeLecture[amour.conversationId], "bubbles")
        XCTAssertNotNil(f.scenes["groupe"]?.messageId)
        XCTAssertNotNil(f.scenes["imagine"]?.messageId)
        XCTAssertEqual(f.destination(.global)?.conversationId, f.conversations.first { $0.type == "global" }?.id)
        XCTAssertEqual(f.posts.count, 2)
        XCTAssertTrue(f.medias.contains { $0.genre == .image && $0.fichier == "osaka-coucher.jpg" })
    }

    /// `toConversation` pose `e2ee` sur toute conversation directe : un cadenas sur un écran traduit
    /// est hors champ (spec § 2), la vitrine sert ses conversations sans mode de chiffrement.
    func test_conversationsServies_carryNoEncryptionLock() throws {
        let f = try VitrineFixtures.decoder(Data(contentsOf: echantillon))
        let servies = f.conversationsServies()
        XCTAssertEqual(servies.count, f.conversations.count)
        XCTAssertTrue(servies.contains { $0.type == .direct })
        XCTAssertTrue(servies.allSatisfy { $0.encryptionMode == nil })
    }
}
