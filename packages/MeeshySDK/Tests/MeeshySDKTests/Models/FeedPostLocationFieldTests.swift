import XCTest
@testable import MeeshySDK

/// La position d'un post était décodée (`APIPost.location`) puis JETÉE au
/// passage domaine : `FeedPost` n'avait pas de champ `location` et
/// `toFeedPost` ne la lisait jamais (constat user 2026-07-30 — aucune carte,
/// aucun sticker sur les posts/réels). Ces tests verrouillent les trois
/// maillons : mapping API → domaine, round-trip cache, décodage legacy.
final class FeedPostLocationFieldTests: XCTestCase {

    private func makePlace() -> SharedPlace {
        SharedPlace(latitude: 48.8584, longitude: 2.2945,
                    name: "Tour Eiffel", address: "Champ de Mars, Paris")
    }

    func test_codable_roundTrip_preservesLocation() throws {
        var post = FeedPost(author: "A", type: "POST", content: "on est là")
        post.location = makePlace()

        let data = try JSONEncoder().encode(post)
        let decoded = try JSONDecoder().decode(FeedPost.self, from: data)

        XCTAssertEqual(decoded.location?.latitude ?? 0, 48.8584, accuracy: 0.0001)
        XCTAssertEqual(decoded.location?.name, "Tour Eiffel")
        XCTAssertEqual(decoded.location?.address, "Champ de Mars, Paris")
    }

    /// Une page de feed persistée AVANT l'ajout du champ décode sans lever —
    /// même garantie que les compteurs d'engagement (`decodeIfPresent`).
    func test_codable_legacyPayloadWithoutLocation_decodesWithNil() throws {
        let post = FeedPost(author: "A", content: "plain")
        let data = try JSONEncoder().encode(post)
        let decoded = try JSONDecoder().decode(FeedPost.self, from: data)
        XCTAssertNil(decoded.location)
    }

    func test_toFeedPost_mapsTopLevelLocation() throws {
        let json = """
        {
          "id": "p1",
          "content": "au sommet",
          "type": "POST",
          "createdAt": "2026-07-30T10:00:00.000Z",
          "author": { "id": "u1", "name": "Marie", "username": "marie" },
          "location": {
            "latitude": 48.8584,
            "longitude": 2.2945,
            "name": "Tour Eiffel"
          }
        }
        """
        let api = try makeDecoder().decode(APIPost.self, from: Data(json.utf8))

        let post = api.toFeedPost(preferredLanguages: ["fr"])

        XCTAssertEqual(post.location?.latitude ?? 0, 48.8584, accuracy: 0.0001)
        XCTAssertEqual(post.location?.longitude ?? 0, 2.2945, accuracy: 0.0001)
        XCTAssertEqual(post.location?.name, "Tour Eiffel")
    }

    // Mirror of PostModelsTests.makeDecoder — ISO8601 avec secondes fractionnaires.
    private func makeDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let str = try container.decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatter.date(from: str) { return date }
            formatter.formatOptions = [.withInternetDateTime]
            if let date = formatter.date(from: str) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Bad date: \(str)")
        }
        return decoder
    }
}
