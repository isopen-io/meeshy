import Foundation
import Testing
@testable import MeeshySDK

/// #9171 — la résolution d'un `/l/<jeton>` nomme qui l'a partagé (`sharer`,
/// servi par la passerelle depuis #9149). Le partageur est un PLUS : une forme
/// absente, nulle ou illisible donne `nil`, jamais une résolution en échec.
struct ResolvedTrackedLinkSharerTests {

    private func decode(_ json: String) throws -> ResolvedTrackedLink {
        try APIClient.makeAPIPayloadDecoder().decode(ResolvedTrackedLink.self, from: Data(json.utf8))
    }

    private func resolution(sharer: String?) -> String {
        let sharerField = sharer.map { ",\"sharer\":\($0)" } ?? ""
        return """
        {"kind":"tracking","targetType":"REEL","targetId":"r1",
         "originalUrl":"https://meeshy.me/reel/r1","isActive":true\(sharerField)}
        """
    }

    @Test func test_decode_withSharer_carriesNameUsernameAndAvatar() throws {
        let resolved = try decode(resolution(
            sharer: #"{"displayName":"Ada Lovelace","username":"ada","avatar":"https://cdn.meeshy.me/a.webp"}"#
        ))

        #expect(resolved.sharer == TrackedLinkSharer(
            displayName: "Ada Lovelace", username: "ada", avatar: "https://cdn.meeshy.me/a.webp"
        ))
        #expect(resolved.targetId == "r1")
    }

    @Test func test_decode_withSharerWithoutDisplayNameOrAvatar_keepsUsername() throws {
        let resolved = try decode(resolution(sharer: #"{"displayName":null,"username":"ada","avatar":null}"#))

        #expect(resolved.sharer == TrackedLinkSharer(displayName: nil, username: "ada", avatar: nil))
    }

    @Test func test_decode_withNullSharer_hasNoSharerAndKeepsTarget() throws {
        let resolved = try decode(resolution(sharer: "null"))

        #expect(resolved.sharer == nil)
        #expect(resolved.targetType == "REEL")
        #expect(resolved.targetId == "r1")
    }

    @Test func test_decode_withoutSharerKey_hasNoSharer() throws {
        let resolved = try decode(resolution(sharer: nil))

        #expect(resolved.sharer == nil)
        #expect(resolved.originalUrl == "https://meeshy.me/reel/r1")
    }

    @Test(arguments: [
        #""ada""#,
        #"42"#,
        #"[]"#,
        #"{"displayName":"Ada"}"#,
        #"{"username":42}"#,
        #"{"username":"   "}"#,
    ])
    func test_decode_withMalformedSharer_hasNoSharerAndStillResolves(_ malformed: String) throws {
        let resolved = try decode(resolution(sharer: malformed))

        #expect(resolved.sharer == nil)
        #expect(resolved.kind == "tracking")
        #expect(resolved.targetId == "r1")
        #expect(resolved.isActive == true)
    }

    @Test func test_encodeThenDecode_withSharer_roundTrips() throws {
        let original = ResolvedTrackedLink(kind: "tracking", targetType: "POST", targetId: "p1",
                                           sharer: TrackedLinkSharer(displayName: "Ada", username: "ada"))
        let data = try JSONEncoder().encode(original)
        let decoded = try APIClient.makeAPIPayloadDecoder().decode(ResolvedTrackedLink.self, from: data)

        #expect(decoded.sharer == original.sharer)
        #expect(decoded.targetId == "p1")
    }
}
