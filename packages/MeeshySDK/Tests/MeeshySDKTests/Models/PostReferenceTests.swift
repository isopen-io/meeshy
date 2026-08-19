import Testing
import Foundation
@testable import MeeshySDK

/// Le mode voyage AVEC la référence, et une charge utile ancienne — qui n'en
/// porte aucune — reste décodable.
struct PostReferenceTests {

    private func decodePost(_ json: String) throws -> APIPost {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let str = try container.decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatter.date(from: str) { return date }
            formatter.formatOptions = [.withInternetDateTime]
            if let date = formatter.date(from: str) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(str)")
        }
        return try decoder.decode(APIPost.self, from: Data(json.utf8))
    }

    @Test func test_decode_withDisplay_keepsMode() throws {
        let json = """
        {"userId":"u1","username":"alice","displayName":"Alice B.","avatar":"a.png","display":"NOTE"}
        """.data(using: .utf8)!

        let reference = try JSONDecoder().decode(PostReference.self, from: json)

        #expect(reference.display == .note)
        #expect(reference.displayName == "Alice B.")
    }

    @Test func test_decode_unknownDisplay_fallsBackToInline() throws {
        // Un mode ajouté côté serveur ne doit pas faire échouer le décodage de
        // TOUT le post — l'app ancienne le lit comme du texte, ce qui est le
        // repli le moins surprenant.
        let json = """
        {"userId":"u1","username":"alice","displayName":null,"avatar":null,"display":"FUTURE_MODE"}
        """.data(using: .utf8)!

        let reference = try JSONDecoder().decode(PostReference.self, from: json)

        #expect(reference.display == .inline)
    }

    @Test func test_decode_missingDisplay_fallsBackToInline() throws {
        let json = """
        {"userId":"u1","username":"alice","displayName":null,"avatar":null}
        """.data(using: .utf8)!

        #expect(try JSONDecoder().decode(PostReference.self, from: json).display == .inline)
    }

    @Test func test_post_withoutMentions_stillDecodes() throws {
        // Charge utile d'un serveur non encore déployé : ni `mentions`, ni
        // `referenceAccess`. Le post doit rester lisible.
        let json = """
        {"id":"p1","authorId":"u1","type":"POST","visibility":"PUBLIC","createdAt":"2026-08-19T10:00:00.000Z","author":{"id":"u1","username":"alice","displayName":null,"avatar":null}}
        """

        let post = try decodePost(json)

        #expect(post.mentions == nil)
        #expect(post.referenceAccess == nil)
    }

    @Test func test_post_withUnknownReferenceAccess_stillDecodes() throws {
        // Un verdict ajouté côté serveur ne doit pas rendre le post illisible :
        // la liste de stories est décodée en tableau STRICT, donc un seul post
        // qui lève emporte le lot entier — même piège que `storyEffects`, dont
        // le décodage est déjà tolérant pour cette raison. Repli sur `none` :
        // un verdict qu'on ne comprend pas ne doit rien OUVRIR.
        let json = """
        {"id":"p1","type":"STORY","visibility":"PUBLIC","createdAt":"2026-08-19T10:00:00.000Z","author":{"id":"u1","username":"alice","displayName":null,"avatar":null},"referenceAccess":"FUTURE_VERDICT"}
        """

        let post = try decodePost(json)

        #expect(post.referenceAccess == ReferenceAccess.none)
    }

    @Test func test_post_withMalformedMention_stillDecodes() throws {
        // Une seule référence illisible ne doit pas emporter le post — ni, par
        // ricochet, le lot de stories dans lequel il voyage. La rangée « Avec …
        // » disparaît, le contenu reste.
        let json = """
        {"id":"p1","type":"POST","visibility":"PUBLIC","createdAt":"2026-08-19T10:00:00.000Z","author":{"id":"u1","username":"alice","displayName":null,"avatar":null},"mentions":[{"userId":"u2"}]}
        """

        let post = try decodePost(json)

        #expect(post.mentions == nil)
    }
}
