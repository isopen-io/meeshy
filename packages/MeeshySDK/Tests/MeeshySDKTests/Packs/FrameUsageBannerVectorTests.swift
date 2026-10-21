import Foundation
import Testing
@testable import MeeshySDK

/// Rejeu iOS de `packages/shared/design/packs/frame-usage-banner-vectors.json`
/// (#10932) : la surface BANNIÈRE de la loi des cadres. Sur divergence, le TS a raison.
@Suite("Cadres — la surface bannière rejouée sur les vecteurs partagés")
struct FrameUsageBannerVectorTests {

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

    private struct Vectors: Decodable {
        let cases: [Case]
        let labels: [Label]
    }

    private static var vectorsURL: URL {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 { url.deleteLastPathComponent() }
        return url.appendingPathComponent("shared/design/packs/frame-usage-banner-vectors.json")
    }

    private static func load() throws -> Vectors {
        try JSONDecoder().decode(Vectors.self, from: Data(contentsOf: vectorsURL))
    }

    @Test("chaque cadre × contexte bannière rend le verdict de la loi TypeScript")
    func everyCaseMatches() throws {
        let vectors = try Self.load()
        #expect(vectors.cases.count >= 60)
        let failures = vectors.cases
            .filter { FrameUsageLaw.canUseFrame($0.usage, $0.context) != $0.expected }
            .map { "« \($0.name) » attendu \($0.expected)" }
        #expect(failures.isEmpty, "\(failures.count) cas divergent(s) :\n\(failures.joined(separator: "\n"))")
    }

    @Test("un contour d'avatar ne sert pas la bannière, un cadre de bannière ne sert que la bannière")
    func bannerIsASurfaceOfItsOwn() {
        #expect(!FrameUsageLaw.canUseFrame(.free(surfaces: [.avatar]), .banner))
        #expect(!FrameUsageLaw.canUseFrame(.free(surfaces: [.call, .photo, .video]), .banner))
        #expect(FrameUsageLaw.canUseFrame(.free(surfaces: [.banner]), .banner))
        #expect(!FrameUsageLaw.canUseFrame(.free(surfaces: [.banner]), .avatar))
        #expect(!FrameUsageLaw.canUseFrame(.free(surfaces: [.banner]), .capture(.photo)))
        #expect(FrameUsageLaw.describeFrameUsage(.free(surfaces: [.banner])).key == FrameUsageLaw.LabelKey.bannerFrameOnly)
    }

    @Test("le libellé d'un cadre de bannière est la clé du TypeScript")
    func labelsMatch() throws {
        let labels = try Self.load().labels
        #expect(!labels.isEmpty)
        for label in labels {
            let described = FrameUsageLaw.describeFrameUsage(label.usage)
            #expect(described.key == label.key)
            #expect(described.params == label.params)
        }
    }

    @Test("un usage bannière mêlé à une surface inconnue ou dupliqué ne se décode pas")
    func invalidUsagesAreRejected() throws {
        let root = try #require(try JSONSerialization.jsonObject(with: Data(contentsOf: Self.vectorsURL)) as? [String: Any])
        let invalid = try #require(root["invalidUsages"] as? [Any])
        #expect(invalid.count >= 2)
        for usage in invalid {
            let data = try JSONSerialization.data(withJSONObject: usage)
            #expect(throws: (any Error).self) { try JSONDecoder().decode(FrameUsage.self, from: data) }
        }
    }
}
