import Foundation
import Testing
@testable import MeeshySDK

/// Rejeu iOS de `packages/shared/design/packs/frame-usage-vectors.json`, la loi
/// d'usage des cadres (#10146) : le MÊME fichier que vitest rejoue, lu, jamais
/// copié. Sur divergence, le TS a raison : le miroir bouge, jamais le vecteur.
@Suite("Cadres — la loi d'usage rejouée sur les vecteurs partagés")
struct FrameUsageVectorTests {

    private struct Case: Decodable {
        let rule: String
        let name: String
        let usage: FrameUsage
        let context: FrameUseContext
        let expected: Bool
    }

    private struct Label: Decodable {
        let usage: FrameUsage
        let key: String
        let params: [String: String]
    }

    private struct Projection: Decodable {
        let surfaces: [CaptureFrameSurface]?
        let usage: FrameUsage
    }

    private struct Vectors: Decodable {
        let cases: [Case]
        let labels: [Label]
        let captureProjection: [Projection]
    }

    /// `packages/MeeshySDK/Tests/MeeshySDKTests/Packs/…` : **5** composants à retirer pour atteindre `packages/`.
    private static var packagesURL: URL {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 { url.deleteLastPathComponent() }
        return url
    }

    private static var vectorsURL: URL {
        packagesURL.appendingPathComponent("shared/design/packs/frame-usage-vectors.json")
    }

    private static func load() throws -> Vectors {
        try JSONDecoder().decode(Vectors.self, from: Data(contentsOf: vectorsURL))
    }

    @Test("chaque cadre × contexte rend, sur la loi Swift, le verdict de la loi TypeScript")
    func everyCaseMatches() throws {
        let vectors = try Self.load()
        #expect(vectors.cases.count >= 150)
        let failures = vectors.cases
            .filter { FrameUsageLaw.canUseFrame($0.usage, $0.context) != $0.expected }
            .map { "« \($0.name) » attendu \($0.expected)" }
        #expect(failures.isEmpty, "\(failures.count) cas divergent(s) :\n\(failures.joined(separator: "\n"))")
    }

    @Test("chaque règle a au moins un cas positif et un cas négatif — jamais de vert silencieux")
    func everyRuleIsWitnessedBothWays() throws {
        let cases = try Self.load().cases
        let byRule = Dictionary(grouping: cases, by: \.rule)
        #expect(byRule.count >= 6)
        for (rule, ruleCases) in byRule {
            #expect(ruleCases.contains { $0.expected }, "règle sans cas positif : \(rule)")
            #expect(ruleCases.contains { !$0.expected }, "règle sans cas négatif : \(rule)")
        }
    }

    @Test("un cadre de capture seule ne sert jamais l'appel ; un cadre d'appel sert l'appel et la capture")
    func callAndCaptureDirective() {
        let captureOnly = FrameUsage.free(surfaces: [.photo, .video])
        let call = FrameUsage.free(surfaces: [.call])
        #expect(!FrameUsageLaw.canUseFrame(captureOnly, .call))
        #expect(FrameUsageLaw.canUseFrame(captureOnly, .capture(.photo)))
        #expect(FrameUsageLaw.canUseFrame(call, .call))
        #expect(FrameUsageLaw.canUseFrame(call, .capture(.video)))
        #expect(!FrameUsageLaw.canUseFrame(call, .achievement(rarity: nil)))
        #expect(!FrameUsageLaw.canUseFrame(.prestige, .achievement(rarity: nil)))
        #expect(!FrameUsageLaw.canUseFrame(.rank(.ambassadeur, division: .iv), .rank(.ambassadeur, division: .ii)))
    }

    @Test("chaque libellé d'usage rend la clé et les paramètres du TypeScript")
    func labelsMatch() throws {
        let labels = try Self.load().labels
        #expect(labels.count >= 10)
        for label in labels {
            let described = FrameUsageLaw.describeFrameUsage(label.usage)
            #expect(described.key == label.key, "\(label.usage)")
            #expect(described.params == label.params, "\(label.usage)")
        }
    }

    @Test("les douze clés de libellé sont celles de FRAME_USAGE_LABEL_KEYS (avatarOnly #10715, bannerFrameOnly #10932)")
    func labelKeysMatchTheSharedTable() throws {
        let source = try String(contentsOf: Self.packagesURL.appendingPathComponent("shared/types/frame-usage.ts"), encoding: .utf8)
        let block = try #require(source.range(of: #"(?s)export const FRAME_USAGE_LABEL_KEYS = \{(.*?)\} as const;"#, options: .regularExpression))
        let regex = try NSRegularExpression(pattern: #"'(frame\.usage\.[A-Za-z]+)'"#)
        let text = String(source[block])
        let keys = regex.matches(in: text, range: NSRange(text.startIndex..., in: text)).compactMap { match in
            Range(match.range(at: 1), in: text).map { String(text[$0]) }
        }
        #expect(keys.count == 12)
        #expect(Set(keys) == Set(FrameUsageLaw.LabelKey.all))
        #expect(FrameUsageLaw.LabelKey.all.count == 12)
    }

    @Test("les cadres de capture d'appel se projettent comme le TypeScript")
    func captureProjectionMatches() throws {
        let projections = try Self.load().captureProjection
        #expect(projections.count >= 4)
        for projection in projections {
            #expect(FrameUsageLaw.captureFrameUsage(projection.surfaces) == projection.usage, "\(String(describing: projection.surfaces))")
        }
    }

    @Test("un usage illisible ne se décode pas — fail-closed")
    func invalidUsagesAreRejected() throws {
        let root = try #require(try JSONSerialization.jsonObject(with: Data(contentsOf: Self.vectorsURL)) as? [String: Any])
        let invalid = try #require(root["invalidUsages"] as? [Any])
        #expect(invalid.count >= 5)
        for usage in invalid {
            let data = try JSONSerialization.data(withJSONObject: usage)
            #expect(throws: (any Error).self, "\(usage)") { try JSONDecoder().decode(FrameUsage.self, from: data) }
        }
    }

    @Test("un contexte illisible ne se décode pas — le Mythe sans division, tout autre rang avec")
    func invalidContextsAreRejected() throws {
        let root = try #require(try JSONSerialization.jsonObject(with: Data(contentsOf: Self.vectorsURL)) as? [String: Any])
        let invalid = try #require(root["invalidContexts"] as? [Any])
        #expect(invalid.count >= 3)
        for context in invalid {
            let data = try JSONSerialization.data(withJSONObject: context)
            #expect(throws: (any Error).self, "\(context)") { try JSONDecoder().decode(FrameUseContext.self, from: data) }
        }
    }

    @Test("un usage s'encode et se relit à l'identique")
    func usageRoundTrips() throws {
        let usages: [FrameUsage] = [
            .free(surfaces: [.call, .photo, .video]),
            .rank(.ambassadeur, division: .iv),
            .rank(.mythe, division: nil),
            .prestige,
            .achievement(rarity: .epic),
            .achievement(rarity: nil),
            .moment(.level100),
        ]
        for usage in usages {
            let data = try JSONEncoder().encode(usage)
            #expect(try JSONDecoder().decode(FrameUsage.self, from: data) == usage)
        }
    }
}
