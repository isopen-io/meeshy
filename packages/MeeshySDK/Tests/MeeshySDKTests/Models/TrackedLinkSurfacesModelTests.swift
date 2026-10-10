import Foundation
import Testing
@testable import MeeshySDK

/// #9075 — la carte `{ url → token }` des liens suivis atteint les modèles que
/// lisent la légende de story et les commentaires, et la redirection suit
/// l'origine web de l'environnement actif.
struct TrackedLinkSurfacesModelTests {

    private static let carte = ["https://meeshy.me/notes": "tok42"]
    private static let carteJSON = "[{\"url\":\"https://meeshy.me/notes\",\"token\":\"tok42\"}]"

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try APIClient.makeAPIPayloadDecoder().decode(T.self, from: Data(json.utf8))
    }

    private func commentaire(_ extra: String) -> String {
        """
        {"id":"c-1","content":"x","createdAt":"2026-10-02T10:00:00.000Z",
         "author":{"id":"u-1","username":"ada"}\(extra)}
        """
    }

    @Test func redirectURL_suitLOrigineInjectee() {
        #expect(TrackedLink.redirectURL(token: "tok42", webOrigin: "https://staging.meeshy.me")?.absoluteString
                == "https://staging.meeshy.me/l/tok42")
    }

    @Test func commentaire_litLaCarteDuMetadataEtLaCarteHissee() throws {
        let rest = try decode(APIPostComment.self, commentaire(",\"metadata\":{\"trackingLinks\":\(Self.carteJSON)}"))
        let socket = try decode(APIPostComment.self, commentaire(",\"trackingLinks\":\(Self.carteJSON)"))

        #expect(rest.trackedLinkMap == Self.carte)
        #expect(socket.trackedLinkMap == Self.carte)
    }

    @Test func commentaire_metadataIllisible_garderLeCommentaire() throws {
        let api = try decode(APIPostComment.self, commentaire(",\"metadata\":\"oops\""))

        #expect(api.trackedLinkMap.isEmpty)
    }

    @Test func story_porteLaCarteDuPost() throws {
        let post = try decode(APIPost.self, """
        {"id":"s-1","type":"STORY","content":"x","createdAt":"2026-10-02T10:00:00.000Z",
         "author":{"id":"u-1","username":"ada"},"metadata":{"trackingLinks":\(Self.carteJSON)}}
        """)

        #expect([post].toStoryGroups().first?.stories.first?.trackedLinkMap == Self.carte)
    }
}
