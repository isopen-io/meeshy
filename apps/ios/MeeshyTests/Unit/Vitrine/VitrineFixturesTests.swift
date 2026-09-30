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
        XCTAssertEqual(f.version, 1)
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
        XCTAssertEqual(f.conversations.first { $0.title == "Pizza Night 🍕" }?.unreadCount, 9)
        for direct in f.conversations where direct.type == "direct" {
            XCTAssertEqual(direct.participants?.count, 2, "Conversation directe sans ses deux membres.")
        }
        XCTAssertNotNil(f.progression.meesh?.firstMintedAt, "Progression sans Meesh.")
        XCTAssertEqual(f.progression.elan?.factor, 3, "Progression sans Élan.")
        XCTAssertEqual(f.lienInvitation.name, "Lisboa ✈️")
    }

    func test_decoder_unknownVersion_throwsVersionInconnue() throws {
        var brut = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: echantillon)) as? [String: Any])
        brut["version"] = 2
        let data = try JSONSerialization.data(withJSONObject: brut)
        XCTAssertThrowsError(try VitrineFixtures.decoder(data)) { erreur in
            XCTAssertEqual(erreur as? VitrineFixturesErreur, .versionInconnue(2))
        }
    }
}
