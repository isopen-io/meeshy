import Foundation
import Testing
@testable import MeeshySDK

/// **La loi du tier rejoue le fichier de vecteurs COMMUN (#11281)** —
/// `packages/shared/fixtures/device-tier-vectors.json`, que la jumelle web
/// (W10, `apps/web/src/lib/device/capability-tier.ts`) rejouera telle quelle.
/// Les entrées y sont NEUTRES : aucune puce, rien qu'iOS seul saurait lire. Les
/// deux lois ne peuvent donc pas diverger sans qu'une des deux rougisse.
@Suite("DeviceMediaTier — les vecteurs partagés avec le web")
struct DeviceMediaTierVectorTests {

    struct Vector: Decodable, Sendable, CustomTestStringConvertible {
        let name: String
        let input: DeviceMediaInputs
        let tier: String
        var testDescription: String { "\(name) → \(tier)" }
    }

    private struct File: Decodable {
        let vectors: [Vector]
    }

    static let fileURL: URL = {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<6 { url.deleteLastPathComponent() }
        return url.appendingPathComponent("packages/shared/fixtures/device-tier-vectors.json")
    }()

    static func vectors() throws -> [Vector] {
        try JSONDecoder().decode(File.self, from: Data(contentsOf: fileURL)).vectors
    }

    /// Pour les arguments du test paramétré : un fichier illisible rend une
    /// liste vide, et `fileCoversEveryTier` rougit à sa place.
    static let sharedVectors: [Vector] = (try? vectors()) ?? []

    static func tier(named name: String) -> DeviceMediaTier? {
        ["low": .low, "mid": .mid, "high": .high, "pro": .pro][name]
    }

    @Test("le fichier de vecteurs est lu, et couvre les quatre tiers")
    func fileCoversEveryTier() throws {
        let vectors = try Self.vectors()
        #expect(vectors.count >= 20)
        let tiers = Set(vectors.compactMap { Self.tier(named: $0.tier) })
        #expect(tiers == Set(DeviceMediaTier.allCases))
    }

    @Test("chaque vecteur partagé tombe dans son tier", arguments: DeviceMediaTierVectorTests.sharedVectors)
    func eachSharedVector(_ vector: Vector) throws {
        let expected = try #require(Self.tier(named: vector.tier), "tier inconnu : \(vector.tier)")
        #expect(DeviceMediaTier.classify(vector.input) == expected)
    }
}
