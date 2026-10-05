import Foundation
import Testing
@testable import MeeshySDK

/// Parité de la loi de l'extrait (#8147) — `LongMessageExcerpt` rejoue les
/// vecteurs du domicile TypeScript (`longMessageExcerpt`,
/// `packages/shared/utils/long-message.ts`), lus DANS LE DÉPÔT : un vecteur
/// ajouté côté partagé est rejoué ici sans rien recopier.
struct LongMessageExcerptVectorTests {

    private struct VectorCase: Decodable {
        let label: String
        let input: Input
        let expected: Expected

        struct Input: Decodable { let text: String }
        struct Expected: Decodable {
            let truncated: Bool
            let excerpt: String
        }

        enum CodingKeys: String, CodingKey {
            case label = "_label"
            case input
            case expected
        }
    }

    private static var vectorsURL: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("shared/fixtures/long-message/excerpt.vectors.json")
    }

    private static func loadVectors() throws -> [VectorCase] {
        let data = try Data(contentsOf: vectorsURL)
        return try JSONDecoder().decode([VectorCase].self, from: data)
    }

    @Test func vectors_areLoaded_neverAnEmptyLoop() throws {
        #expect(try Self.loadVectors().count >= 10)
    }

    @Test func excerpt_replaysEverySharedVector() throws {
        for vector in try Self.loadVectors() {
            let excerpt = LongMessageExcerpt.excerpt(vector.input.text)
            #expect((excerpt != nil) == vector.expected.truncated, "cas « \(vector.label) » : troncature")
            #expect((excerpt ?? vector.input.text) == vector.expected.excerpt, "cas « \(vector.label) » : extrait")
        }
    }
}
