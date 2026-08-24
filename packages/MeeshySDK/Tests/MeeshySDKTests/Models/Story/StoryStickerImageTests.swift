import Testing
import Foundation
@testable import MeeshySDK

/// S1 — un sticker importé est une IMAGE INTÉGRÉE à l'entité publiée
/// (`postMediaId`, même espace d'ids que tout autre média du post), jamais une
/// référence externe. `emoji` reste, comme repli que les lecteurs anciens
/// savent rendre.
struct StoryStickerImageTests {

    private func payload(of sticker: StorySticker) throws -> [String: CanvasJSONValue] {
        var effects = StoryEffects()
        effects.stickerObjects = [sticker]
        let document = CanvasV3(migrating: effects)
        let object = document.scenes.first?.objects.first { $0.id == sticker.id }
        return try #require(object?.payload)
    }

    private func fallbackEmoji(in payload: [String: CanvasJSONValue]) throws -> String {
        guard case .string(let emoji) = try #require(payload["emoji"]) else {
            Issue.record("le repli `emoji` doit rester une chaîne au fil")
            return ""
        }
        return emoji
    }

    // MARK: - Non-régression du sticker emoji

    @Test func emojiSticker_emitsExactlyThePayloadItAlwaysDid() throws {
        let expected: [String: CanvasJSONValue] = ["emoji": .string("🌍")]
        let wire = try payload(of: StorySticker(id: "st-emoji", emoji: "🌍"))
        #expect(wire == expected)
    }

    @Test func emojiSticker_isReadBackAsAnEmojiSticker() throws {
        var effects = StoryEffects()
        effects.stickerObjects = [StorySticker(id: "st-emoji", emoji: "🌍")]
        let back = StoryEffects(rendering: CanvasV3(migrating: effects), sceneIndex: 0)
        let sticker = try #require(back.stickerObjects?.first)
        #expect(sticker.kind == .emoji)
        #expect(sticker.postMediaId.isEmpty)
        #expect(sticker.provider == nil)
    }

    // MARK: - Le sticker image

    @Test func imageSticker_carriesItsPostMediaIdAndProvider() throws {
        let wire = try payload(of: StorySticker(id: "st-img", emoji: "",
                                                postMediaId: "64b0000000000000000000ff",
                                                provider: "genmoji"))
        #expect(wire["postMediaId"] == .string("64b0000000000000000000ff"))
        #expect(wire["provider"] == .string("genmoji"))
    }

    /// `CanvasV3Scene.tsx` fait `if (!emoji) return null` : un sticker image
    /// parti sans repli emoji DISPARAÎT chez un lecteur ancien.
    @Test func imageSticker_alwaysShipsANonEmptyFallbackEmoji() throws {
        let wire = try payload(of: StorySticker(id: "st-img", emoji: "",
                                                postMediaId: "64b0000000000000000000ff"))
        let emoji = try fallbackEmoji(in: wire)
        #expect(!emoji.isEmpty)
    }

    @Test func imageSticker_prefersTheAuthorsOwnEmojiAsFallback() throws {
        let wire = try payload(of: StorySticker(id: "st-img", emoji: "🐙",
                                                postMediaId: "64b0000000000000000000ff"))
        let emoji = try fallbackEmoji(in: wire)
        #expect(emoji == "🐙")
    }

    @Test func imageSticker_isReadBackAsAnImageSticker() throws {
        var effects = StoryEffects()
        effects.stickerObjects = [StorySticker(id: "st-img", emoji: "🐙",
                                               postMediaId: "64b0000000000000000000ff",
                                               provider: "bitmoji")]
        let back = StoryEffects(rendering: CanvasV3(migrating: effects), sceneIndex: 0)
        let sticker = try #require(back.stickerObjects?.first)
        #expect(sticker.kind == .image)
        #expect(sticker.emoji == "🐙")
        #expect(sticker.postMediaId == "64b0000000000000000000ff")
        #expect(sticker.provider == "bitmoji")
    }

    /// Un écrivain d'en face peut oublier le repli : l'image reste rendable,
    /// donc le sticker survit et repart avec un repli.
    @Test func imageStickerWithoutAnyEmojiOnTheWire_survivesTheRead() throws {
        let json = #"""
        {"v":3,"scenes":[{"id":"s1","objects":[{"id":"st-img","kind":"sticker",
        "anchor":{"t":"free","x":0.5,"y":0.5},"plane":"fg","z":0,
        "transform":{"scale":1,"rotation":0,"opacity":1},
        "payload":{"postMediaId":"64b0000000000000000000ff","provider":"thirdParty"}}]}]}
        """#
        let document = try JSONDecoder().decode(CanvasV3.self, from: Data(json.utf8))
        let effects = StoryEffects(rendering: document, sceneIndex: 0)
        let sticker = try #require(effects.stickerObjects?.first)
        #expect(sticker.kind == .image)
        #expect(!sticker.emoji.isEmpty)
        #expect(sticker.provider == "thirdParty")
    }

    // MARK: - Documents anciens (Codable)

    @Test func legacyStickerDocument_decodesWithoutAnImage() throws {
        let json = #"{"stickerObjects":[{"id":"st1","emoji":"🌍","x":0.4,"y":0.6,"baseSize":300}]}"#
        let effects = try JSONDecoder().decode(StoryEffects.self, from: Data(json.utf8))
        let sticker = try #require(effects.stickerObjects?.first)
        #expect(sticker.kind == .emoji)
        #expect(sticker.postMediaId.isEmpty)
        #expect(sticker.provider == nil)
        #expect(sticker.baseSize == 300)
    }

    @Test func codableRoundTrip_preservesEmojiImageAndProvider() throws {
        let sticker = StorySticker(id: "st-img", emoji: "🐙",
                                   postMediaId: "64b0000000000000000000ff",
                                   provider: "library")
        let decoded = try JSONDecoder().decode(StorySticker.self,
                                               from: JSONEncoder().encode(sticker))
        #expect(decoded.emoji == "🐙")
        #expect(decoded.postMediaId == "64b0000000000000000000ff")
        #expect(decoded.provider == "library")
        #expect(decoded.kind == .image)
    }
}
