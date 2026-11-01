import Foundation
import Testing
@testable import MeeshySDK

/// **Le logo de cercle d'une story exportée rejoue le fichier de vecteurs
/// COMMUN (#13997)** — `packages/shared/fixtures/relation-export-badge.vectors.json`,
/// que la loi TypeScript (`relationExportBadge`) et le miroir Kotlin rejouent
/// telle quelle. Les trois lois ne peuvent donc pas diverger sans qu'une des
/// trois rougisse.
@Suite("RelationExportBadge — les vecteurs partagés avec le web et Android")
struct RelationExportBadgeVectorTests {

    struct Vector: Decodable, Sendable, CustomTestStringConvertible {
        let label: String
        let input: String?
        let expected: String?
        var testDescription: String { "\(label) : \(input ?? "nil") → \(expected ?? "rien")" }

        enum CodingKeys: String, CodingKey {
            case label = "_label"
            case input, expected
        }
    }

    private struct File: Decodable {
        let minLevel: String
        let vectors: [Vector]
    }

    static let fileURL: URL = {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<6 { url.deleteLastPathComponent() }
        return url.appendingPathComponent("packages/shared/fixtures/relation-export-badge.vectors.json")
    }()

    static func file() throws -> (minLevel: String, vectors: [Vector]) {
        let decoded = try JSONDecoder().decode(File.self, from: Data(contentsOf: fileURL))
        return (decoded.minLevel, decoded.vectors)
    }

    /// Un fichier illisible rend une liste vide, et `fileIsReadAndCoversBothLogos` rougit à sa place.
    static let sharedVectors: [Vector] = (try? file().vectors) ?? []

    @Test("le fichier de vecteurs est lu, et couvre les deux logos et le silence")
    func fileIsReadAndCoversBothLogos() throws {
        let file = try Self.file()
        #expect(file.minLevel == RelationExportBadge.minimumLevel)
        #expect(file.vectors.count >= 11)
        #expect(Set(file.vectors.compactMap(\.expected)) == ["🔥", "🩸"])
        #expect(file.vectors.contains { $0.expected == nil })
    }

    @Test("chaque vecteur partagé rend son logo (ou rien)", arguments: RelationExportBadgeVectorTests.sharedVectors)
    func eachSharedVector(_ vector: Vector) {
        #expect(RelationExportBadge.emoji(forServedLevel: vector.input) == vector.expected)
    }
}
