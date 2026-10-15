import Foundation
import Testing
@testable import MeeshySDK

/// Rejeu iOS de `packages/shared/design/packs/frame-usage-avatar-vectors.json`
/// (#10632, § 3.3) : la surface AVATAR de la loi des cadres. Sur divergence, le TS a raison.
@Suite("Cadres — la surface avatar rejouée sur les vecteurs partagés")
struct FrameUsageAvatarVectorTests {

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
        return url.appendingPathComponent("shared/design/packs/frame-usage-avatar-vectors.json")
    }

    private static func load() throws -> Vectors {
        try JSONDecoder().decode(Vectors.self, from: Data(contentsOf: vectorsURL))
    }

    @Test("chaque cadre × contexte avatar rend le verdict de la loi TypeScript")
    func everyCaseMatches() throws {
        let vectors = try Self.load()
        #expect(vectors.cases.count >= 40)
        let failures = vectors.cases
            .filter { FrameUsageLaw.canUseFrame($0.usage, $0.context) != $0.expected }
            .map { "« \($0.name) » attendu \($0.expected)" }
        #expect(failures.isEmpty, "\(failures.count) cas divergent(s) :\n\(failures.joined(separator: "\n"))")
    }

    @Test("un cadre d'appel ne sert pas l'avatar, un contour d'avatar ne sert que l'avatar")
    func avatarIsASurfaceOfItsOwn() {
        #expect(!FrameUsageLaw.canUseFrame(.free(surfaces: [.call]), .avatar))
        #expect(!FrameUsageLaw.canUseFrame(.free(surfaces: [.call, .photo, .video]), .avatar))
        #expect(FrameUsageLaw.canUseFrame(.free(surfaces: [.avatar]), .avatar))
        #expect(!FrameUsageLaw.canUseFrame(.free(surfaces: [.avatar]), .call))
        #expect(!FrameUsageLaw.canUseFrame(.free(surfaces: [.avatar]), .capture(.photo)))
    }

    @Test("le libellé d'un contour d'avatar est la clé du TypeScript")
    func labelsMatch() throws {
        let labels = try Self.load().labels
        #expect(!labels.isEmpty)
        for label in labels {
            let described = FrameUsageLaw.describeFrameUsage(label.usage)
            #expect(described.key == label.key)
            #expect(described.params == label.params)
        }
    }

    @Test("un usage avatar mêlé à une surface inconnue ou dupliqué ne se décode pas")
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
