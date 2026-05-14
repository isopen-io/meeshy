import Testing
import Foundation
@testable import MeeshySDK

@Suite("StoryTextBackgroundStyle — Codable & legacy fallback")
struct StoryTextBackgroundStyleTests {

    // MARK: - StoryTextBackgroundStyle Codable round-trips

    @Test("encode(.none) → decode round-trips")
    func encode_decode_none_roundTrips() throws {
        let style = StoryTextBackgroundStyle.none
        let data = try JSONEncoder().encode(style)
        let decoded = try JSONDecoder().decode(StoryTextBackgroundStyle.self, from: data)
        #expect(decoded == .none)
    }

    @Test("encode(.solid(hex:)) → decode round-trips")
    func encode_decode_solid_roundTrips() throws {
        let style = StoryTextBackgroundStyle.solid(hex: "FF00AA")
        let data = try JSONEncoder().encode(style)
        let decoded = try JSONDecoder().decode(StoryTextBackgroundStyle.self, from: data)
        if case let .solid(hex) = decoded {
            #expect(hex == "FF00AA")
        } else {
            Issue.record("Expected .solid, got \(decoded)")
        }
    }

    @Test("encode(.glass(radius:)) → decode round-trips")
    func encode_decode_glass_roundTrips() throws {
        let style = StoryTextBackgroundStyle.glass(radius: 24)
        let data = try JSONEncoder().encode(style)
        let decoded = try JSONDecoder().decode(StoryTextBackgroundStyle.self, from: data)
        if case let .glass(radius) = decoded {
            #expect(abs(radius - 24) < 0.0001)
        } else {
            Issue.record("Expected .glass, got \(decoded)")
        }
    }

    // MARK: - Legacy textBg fallback

    @Test("legacy textBg falls back to .solid via resolvedBackgroundStyle")
    func legacy_textBg_fallsBackTo_solid() {
        let obj = StoryTextObject(id: "t1",
                                  text: "Hello",
                                  textBg: "112233")
        // backgroundStyle is nil, but textBg is set — resolver promotes to .solid.
        #expect(obj.backgroundStyle == nil)
        #expect(obj.resolvedBackgroundStyle == .solid(hex: "112233"))
    }

    @Test("no textBg and no backgroundStyle → .none")
    func no_bg_resolvesToNone() {
        let obj = StoryTextObject(id: "t1", text: "Hello")
        #expect(obj.resolvedBackgroundStyle == .none)
    }

    @Test("backgroundStyle wins over legacy textBg")
    func backgroundStyle_wins_overLegacy() {
        let obj = StoryTextObject(id: "t1",
                                  text: "Hello",
                                  textBg: "112233",
                                  backgroundStyle: .glass(radius: 30))
        #expect(obj.resolvedBackgroundStyle == .glass(radius: 30))
    }

    // MARK: - StoryTextObject Codable end-to-end with backgroundStyle

    @Test("StoryTextObject with .glass round-trips through JSON")
    func textObject_glass_roundTrips() throws {
        let original = StoryTextObject(id: "t1",
                                       text: "Hello",
                                       backgroundStyle: .glass(radius: 18))
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(StoryTextObject.self, from: data)
        #expect(decoded.id == "t1")
        #expect(decoded.text == "Hello")
        #expect(decoded.backgroundStyle == .glass(radius: 18))
    }

    @Test("StoryTextObject without backgroundStyle decodes nil")
    func textObject_noBackgroundStyle_decodesNil() throws {
        // JSON written by older clients that don't know about backgroundStyle.
        let legacyJSON = """
        {
          "id": "t1",
          "text": "Hello",
          "x": 0.5, "y": 0.5, "scale": 1.0, "rotation": 0.0,
          "zIndex": 0,
          "anchor": {"x": 0.5, "y": 0.5},
          "fontSize": 64.0,
          "fontFamily": "system",
          "textBg": "AABBCC"
        }
        """.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(StoryTextObject.self, from: legacyJSON)
        #expect(decoded.backgroundStyle == nil)
        #expect(decoded.textBg == "AABBCC")
        // Resolver fallback kicks in.
        #expect(decoded.resolvedBackgroundStyle == .solid(hex: "AABBCC"))
    }
}
