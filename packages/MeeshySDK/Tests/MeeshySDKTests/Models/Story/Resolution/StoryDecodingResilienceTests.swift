import Foundation
import Testing
@testable import MeeshySDK

/// P4 — reader resilience: another user's story with a malformed payload must
/// NOT blank the whole story (object-level lossy decode) nor fail the whole
/// batch decode (APIPost degrades `storyEffects` to nil instead of throwing).
struct StoryDecodingResilienceTests {

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

    /// Encodes a real `StoryEffects`, then replaces one element of the named
    /// array with a scalar so it can no longer decode as an object.
    private func corruptingSecondElement(of key: String, in effects: StoryEffects) throws -> Data {
        let data = try JSONEncoder().encode(effects)
        var obj = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        var arr = try #require(obj[key] as? [Any])
        arr[1] = 42 // a number where an object is expected → element decode fails
        obj[key] = arr
        return try JSONSerialization.data(withJSONObject: obj)
    }

    @Test func mediaObjects_lossyDecode_skipsMalformedElement() throws {
        var effects = StoryEffects()
        effects.mediaObjects = [
            StoryMediaObject(id: "m1", postMediaId: "p1", kind: .image, aspectRatio: 1.0),
            StoryMediaObject(id: "m2", postMediaId: "p2", kind: .image, aspectRatio: 1.0)
        ]
        let corrupted = try corruptingSecondElement(of: "mediaObjects", in: effects)
        let decoded = try JSONDecoder().decode(StoryEffects.self, from: corrupted)
        #expect(decoded.mediaObjects?.count == 1)
        #expect(decoded.mediaObjects?.first?.id == "m1")
    }

    @Test func textObjects_lossyDecode_skipsMalformedElement() throws {
        var effects = StoryEffects()
        effects.textObjects = [
            StoryTextObject(id: "t1", text: "keep"),
            StoryTextObject(id: "t2", text: "corrupt-me")
        ]
        let corrupted = try corruptingSecondElement(of: "textObjects", in: effects)
        let decoded = try JSONDecoder().decode(StoryEffects.self, from: corrupted)
        #expect(decoded.textObjects.count == 1)
        #expect(decoded.textObjects.first?.text == "keep")
    }

    @Test func apiPost_malformedStoryEffects_degradesToNil_keepsPost() throws {
        // `storyEffects` is a String instead of an object → decode of the field
        // throws, but the APIPost must survive with `storyEffects == nil` so the
        // strict-array story feed decode does not drop the whole batch.
        let json = """
        {
            "id": "story-broken",
            "type": "STORY",
            "createdAt": "2026-01-15T10:30:00.000Z",
            "author": {"id": "a1", "username": "alice", "displayName": "Alice"},
            "storyEffects": "totally-not-an-object"
        }
        """.data(using: .utf8)!

        let post = try makeDecoder().decode(APIPost.self, from: json)
        #expect(post.id == "story-broken")
        #expect(post.author.name == "Alice")
        #expect(post.storyEffects == nil)
    }
}
