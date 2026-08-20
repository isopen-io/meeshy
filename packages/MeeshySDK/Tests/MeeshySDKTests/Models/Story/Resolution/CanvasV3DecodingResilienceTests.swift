import Foundation
import Testing
@testable import MeeshySDK

/// Jumelle v3 de `StoryDecodingResilienceTests` (constat 10, revue Opus) : la
/// tolérance par élément protégeait l'archive v1 legacy seule ; le fil sert
/// désormais du v3 par défaut (B7 — `encode(to:)` part toujours du runtime
/// courant), et un `ObjectV3` malformé (une autre story) ne doit ni vider la
/// scène ni faire tomber tout le post qui la porte — les deux points de
/// décodage nus de `FeedModels` (`RepostContent`, `FeedPost`) doivent
/// dégrader `storyEffects` à `nil`, en miroir du `do/catch` de `PostModels`.
struct CanvasV3DecodingResilienceTests {

    private func makeDecoder() -> JSONDecoder {
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
        return decoder
    }

    @Test func objects_lossyDecode_skipsMalformedElement_keepsSceneAndDocument() throws {
        let json = """
        {"v":3,"scenes":[{"id":"s1","objects":[
            {"id":"o1","kind":"text","anchor":{"t":"free","x":0.5,"y":0.5},"plane":"content","z":0,"transform":{"scale":1,"rotation":0,"opacity":1},"payload":{}},
            {"id":"o2","kind":"text","anchor":{"t":"bogus"},"plane":"content","z":1,"transform":{"scale":1,"rotation":0,"opacity":1},"payload":{}},
            {"id":"o3","kind":"text","anchor":{"t":"free","x":0.5,"y":0.5},"plane":"content","z":2,"transform":{"scale":1,"rotation":0,"opacity":1},"payload":{}}
        ]}]}
        """.data(using: .utf8)!

        let document = try JSONDecoder().decode(CanvasV3.self, from: json)
        #expect(document.scenes.count == 1)
        #expect(document.scenes.first?.objects.map(\.id) == ["o1", "o3"])
    }

    @Test func repostContent_malformedStoryEffects_degradesToNil_keepsRepost() throws {
        // `storyEffects` is a String instead of an object → decode of the field
        // throws, but `RepostContent` must survive with `storyEffects == nil`
        // so a quoted repost inside a strict feed page doesn't drop the batch.
        let json = """
        {
            "id": "r1",
            "author": "alice",
            "authorId": "a1",
            "content": "hi",
            "timestamp": "2026-01-15T10:30:00.000Z",
            "likes": 0,
            "isQuote": false,
            "storyEffects": "totally-not-an-object"
        }
        """.data(using: .utf8)!

        let repost = try makeDecoder().decode(RepostContent.self, from: json)
        #expect(repost.id == "r1")
        #expect(repost.storyEffects == nil)
    }

    @Test func feedPost_malformedStoryEffects_degradesToNil_keepsPost() throws {
        // Same shape, one level up: `FeedPost` is the domain model the feed
        // page decodes as a strict array — one throwing `storyEffects` must
        // NOT drop the whole cached/network page.
        let json = """
        {
            "id": "f1",
            "author": "alice",
            "authorId": "a1",
            "content": "hi",
            "timestamp": "2026-01-15T10:30:00.000Z",
            "likes": 0,
            "isLiked": false,
            "comments": [],
            "commentCount": 0,
            "isQuote": false,
            "media": [],
            "storyEffects": "totally-not-an-object"
        }
        """.data(using: .utf8)!

        let post = try makeDecoder().decode(FeedPost.self, from: json)
        #expect(post.id == "f1")
        #expect(post.storyEffects == nil)
    }
}
