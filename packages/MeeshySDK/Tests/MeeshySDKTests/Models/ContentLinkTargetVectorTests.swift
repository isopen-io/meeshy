import Foundation
import Testing
@testable import MeeshySDK

/// **La loi du lien de contenu rejoue les vecteurs PARTAGÉS** (#19331, #19332) —
/// `packages/shared/fixtures/content-link/content-link.vectors.json`, que la loi
/// TypeScript (`contentLinkTarget`) et le miroir Kotlin rejouent aussi. Les
/// trois ne peuvent pas diverger sans qu'un des trois rougisse.
struct ContentLinkTargetVectorTests {

    private struct VectorCase: Decodable {
        let label: String
        let input: String
        let expected: Expected?

        struct Expected: Decodable {
            let kind: String
            let postId: String?
            let type: String?
            let token: String?
        }

        enum CodingKeys: String, CodingKey {
            case label = "_label"
            case input
            case expected
        }
    }

    private struct MalformedVector: Error {
        let label: String
    }

    private static var vectorsURL: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("shared/fixtures/content-link/content-link.vectors.json")
    }

    private static func loadVectors() throws -> [VectorCase] {
        let data = try Data(contentsOf: vectorsURL)
        return try JSONDecoder().decode([VectorCase].self, from: data)
    }

    /// Ce que le vecteur ATTEND, dans le vocabulaire Swift. Un vecteur qu'on ne
    /// sait pas lire lève : il ne passe jamais pour un refus.
    private static func expectedTarget(of vector: VectorCase) throws -> ContentLinkTarget? {
        guard let expected = vector.expected else { return nil }
        switch expected.kind {
        case "content":
            guard let postId = expected.postId else { throw MalformedVector(label: vector.label) }
            guard let raw = expected.type else { return .content(ContentPathTarget(postId: postId, type: nil)) }
            guard let type = PostType(rawValue: raw) else { throw MalformedVector(label: vector.label) }
            return .content(ContentPathTarget(postId: postId, type: type))
        case "tracked":
            guard let token = expected.token else { throw MalformedVector(label: vector.label) }
            return .tracked(token: token)
        default:
            throw MalformedVector(label: vector.label)
        }
    }

    @Test func vectors_areLoaded_neverAnEmptyLoop() throws {
        let vectors = try Self.loadVectors()
        #expect(vectors.count >= 30)
        let kinds = Set(vectors.map { $0.expected?.kind ?? "null" })
        #expect(kinds == ["content", "tracked", "null"])
    }

    @Test func parse_replaysEverySharedVector() throws {
        for vector in try Self.loadVectors() {
            let expected = try Self.expectedTarget(of: vector)
            #expect(ContentLinkTarget.parse(vector.input) == expected, "cas « \(vector.label) »")
        }
    }

    // MARK: - L'intention, lisible

    private static let id = "66f0c0ffee0000000000c0de"

    @Test func parse_eachContentAddress_readsItsIdentifierAndType() {
        #expect(ContentLinkTarget.parse("https://meeshy.me/post/\(Self.id)") == .content(ContentPathTarget(postId: Self.id, type: .post)))
        #expect(ContentLinkTarget.parse("https://meeshy.me/reel/\(Self.id)") == .content(ContentPathTarget(postId: Self.id, type: .reel)))
        #expect(ContentLinkTarget.parse("https://meeshy.me/story/\(Self.id)") == .content(ContentPathTarget(postId: Self.id, type: .story)))
        #expect(ContentLinkTarget.parse("https://meeshy.me/mood/\(Self.id)") == .content(ContentPathTarget(postId: Self.id, type: .status)))
    }

    @Test func parse_defaultHTTPSPort_isNoPort() {
        #expect(ContentLinkTarget.parse("https://meeshy.me:443/post/\(Self.id)") == .content(ContentPathTarget(postId: Self.id, type: .post)))
    }

    @Test func pathTarget_readsThePathAlone() {
        #expect(ContentLinkTarget.pathTarget("/reel/\(Self.id)") == ContentPathTarget(postId: Self.id, type: .reel))
        #expect(ContentLinkTarget.pathTarget("/feeds/post/\(Self.id)/") == ContentPathTarget(postId: Self.id, type: nil))
        #expect(ContentLinkTarget.pathTarget("/l/Ab3xYz") == nil)
        #expect(ContentLinkTarget.pathTarget("/reel/\(Self.id)/x") == nil)
    }

    @Test func webURL_composesTheCanonicalAddress() {
        #expect(ContentLinkTarget.webURL(origin: "https://meeshy.me", type: .post, postId: Self.id) == "https://meeshy.me/post/\(Self.id)")
        #expect(ContentLinkTarget.webURL(origin: "https://meeshy.me/", type: .status, postId: Self.id) == "https://meeshy.me/mood/\(Self.id)")
    }

    @Test func webURL_everyComposedAddress_readsBackToTheSameContent() {
        for type in PostType.allCases {
            let address = ContentLinkTarget.webURL(origin: "https://meeshy.me", type: type, postId: Self.id)
            #expect(ContentLinkTarget.parse(address) == .content(ContentPathTarget(postId: Self.id, type: type)))
        }
    }

    @Test func webHosts_areTheThreeHostsOfTheWebApp() {
        #expect(ContentLinkTarget.webHosts == ["meeshy.me", "www.meeshy.me", "staging.meeshy.me"])
    }

    @Test func contentKinds_areTheFourTypesOnly() {
        #expect(["POST", "REEL", "STORY", "STATUS"].allSatisfy { PostType(rawValue: $0) != nil })
        #expect(["EXTERNAL", "CONVERSATION", "post", ""].allSatisfy { PostType(rawValue: $0) == nil })
    }
}
