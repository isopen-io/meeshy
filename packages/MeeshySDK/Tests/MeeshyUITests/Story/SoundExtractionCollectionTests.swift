import XCTest
import MeeshySDK
@testable import MeeshyUI

/// C7-UI — collecte de `allowSoundExtraction`.
///
/// `allowSoundExtraction: Bool?` traverse déjà le transport (gateway
/// `CreatePostSchema.allowSoundExtraction`, `PostService.create/update(…
/// allowSoundExtraction:)`) mais rien ne le COLLECTAIT côté UI avant
/// `MediaAccessibilityStore` + `SoundExtractionToggle`.
///
/// C'est un flag UNIQUE sur le post entier (`Post.allowSoundExtraction`,
/// `schema.prisma:3125` — « autorise l'extraction de la bande-son des VIDÉOS
/// de ce post/réel »), PAS un champ par média : un seul interrupteur
/// composer-wide, pas un par clip.
@MainActor
final class SoundExtractionCollectionTests: XCTestCase {

    // MARK: - MediaAccessibilityStore

    // MARK: - Gardes de source

    /// Espaces normalisés — cf. `MediaAltCollectionTests.collapsed` : une garde
    /// ancrée sur un littéral multi-lignes tombe au premier retour à la ligne.
    private func collapsed(_ code: String) -> String {
        code.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
    }

    // MARK: - Le défaut AFFICHÉ est celui que la passerelle APPLIQUE (#8012)

    // MARK: - La chaîne ATTEINT le point de publication (C-bis, correctif 3)

    // MARK: - V3-4 — l'opt-in PART (transport, pas seulement collecte)

    /// `test_createStoryRequest_encodesAllowSoundExtraction` rougit si le champ
    /// disparaît du corps de `POST /posts` : le gateway l'accepte depuis
    /// `CreatePostSchema.allowSoundExtraction`, mais `CreateStoryRequest` ne le
    /// portait pas — une story ne pouvait donc PAS l'autoriser.
    func test_createStoryRequest_encodesAllowSoundExtraction() throws {
        let body = CreateStoryRequest(allowSoundExtraction: true)

        let json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: try JSONEncoder().encode(body)) as? [String: Any]
        )

        XCTAssertEqual(json["allowSoundExtraction"] as? Bool, true)
    }

    /// `test_createStoryRequest_omitsAllowSoundExtractionWhenUntouched` rougit
    /// si l'absence de choix part en `false` explicite.
    func test_createStoryRequest_omitsAllowSoundExtractionWhenUntouched() throws {
        let body = CreateStoryRequest(content: "coucou")

        let json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: try JSONEncoder().encode(body)) as? [String: Any]
        )

        XCTAssertNil(json["allowSoundExtraction"])
    }

    // MARK: - F2 — le choix SURVIT à la fermeture du composer
}
