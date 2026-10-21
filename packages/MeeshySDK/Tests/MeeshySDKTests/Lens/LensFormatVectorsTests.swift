import Foundation
import Testing
@testable import MeeshySDK

/// Rejeu iOS de `packages/shared/fixtures/lens-v1/vectors.json`, le contrat MeeshyLens v1
/// (#11270) : le MÊME fichier que vitest rejoue, lu, jamais copié. Le parseur est le Swift
/// GÉNÉRÉ par `packages/shared/scripts/generate-lens-format-swift.ts`.
@Suite("MeeshyLens v1 — les vecteurs partagés rejoués par le Swift généré")
struct LensFormatVectorsTests {

    private struct Expectation: Decodable {
        let status: String
        let layerIds: [String]?
        let triggerCount: Int?
        let ignoredLayers: Int?
        let ignoredTriggers: Int?
        let schema: Int?
        let reasons: [String]?
    }

    private struct Vector: Decodable {
        let name: String
        let input: LensJSONValue
        let expect: Expectation
    }

    private struct Vectors: Decodable {
        let vectors: [Vector]
    }

    /// `packages/MeeshySDK/Tests/MeeshySDKTests/Lens/…` : **6** composants à retirer pour atteindre la racine du dépôt.
    /// Le chemin s'écrit depuis la racine pour que `sdk-tests-shared-inputs.test.ts` le voie et exige
    /// que `sdk-tests.yml` rejoue ce test quand les vecteurs changent.
    private static var vectorsURL: URL {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<6 { url.deleteLastPathComponent() }
        return url.appendingPathComponent("packages/shared/fixtures/lens-v1/vectors.json")
    }

    private static func load() throws -> [Vector] {
        try JSONDecoder().decode(Vectors.self, from: Data(contentsOf: vectorsURL)).vectors
    }

    private static func summary(_ outcome: LensParseOutcome) -> Expectation {
        switch outcome {
        case let .ok(lens, ignoredLayers, ignoredTriggers):
            return Expectation(status: "ok", layerIds: lens.layers.map(\.id), triggerCount: lens.triggers.count,
                               ignoredLayers: ignoredLayers, ignoredTriggers: ignoredTriggers, schema: nil, reasons: nil)
        case let .updateRequired(schema):
            return Expectation(status: "update-required", layerIds: nil, triggerCount: nil, ignoredLayers: nil,
                               ignoredTriggers: nil, schema: schema, reasons: nil)
        case let .forbidden(reasons):
            return Expectation(status: "forbidden", layerIds: nil, triggerCount: nil, ignoredLayers: nil,
                               ignoredTriggers: nil, schema: nil, reasons: reasons)
        case .invalid:
            return Expectation(status: "invalid", layerIds: nil, triggerCount: nil, ignoredLayers: nil,
                               ignoredTriggers: nil, schema: nil, reasons: nil)
        }
    }

    @Test("chaque vecteur rend l'issue, les couches et les compteurs attendus")
    func everyVectorMatches() throws {
        let vectors = try Self.load()
        #expect(vectors.count > 40)
        let failures = vectors.compactMap { vector -> String? in
            let actual = Self.summary(LensFormat.parse(vector.input))
            let expected = vector.expect
            guard actual.status != expected.status
                || actual.layerIds != expected.layerIds
                || actual.triggerCount != expected.triggerCount
                || actual.ignoredLayers != expected.ignoredLayers
                || actual.ignoredTriggers != expected.ignoredTriggers
                || actual.schema != expected.schema
                || actual.reasons != expected.reasons else { return nil }
            return "« \(vector.name) » : \(actual.status) \(actual.layerIds ?? []) \(actual.reasons ?? [])"
        }
        #expect(failures.isEmpty, "\(failures.count) vecteur(s) divergent(s) :\n\(failures.joined(separator: "\n"))")
    }

    @Test("les quatre issues du contrat sont couvertes par les vecteurs")
    func everyStatusIsCovered() throws {
        let statuses = Set(try Self.load().map(\.expect.status))
        #expect(statuses == ["ok", "update-required", "forbidden", "invalid"])
    }

    @Test("un JSON qui n'est pas du JSON n'est pas une lens")
    func garbageDataIsInvalid() {
        guard case .invalid = LensFormat.parse(Data("pas du json".utf8)) else {
            Issue.record("attendu invalid")
            return
        }
    }

    @Test("un schéma futur, lu en Data, demande la mise à jour")
    func futureSchemaFromDataAsksForUpdate() {
        guard case let .updateRequired(schema) = LensFormat.parse(Data(#"{"schema":7}"#.utf8)) else {
            Issue.record("attendu updateRequired")
            return
        }
        #expect(schema == 7)
    }
}
