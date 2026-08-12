import Testing
import Foundation
@testable import MeeshySDK

/// Nouvelles familles de style texte (calligraphie, cartoon, futuriste,
/// fantaisie, curve, tag) et nouvelles formes de cadre (losange, nuage,
/// bulle BD) : parsing, round-trip Codable et mapping police.
struct StoryTextStyleAndFrameShapeTests {

    @Test func newTextStyles_parseFromRawValue() {
        var text = StoryTextObject(id: "t1", text: "X")
        text.textStyle = "calligraphy"
        #expect(text.parsedTextStyle == .calligraphy)
        text.textStyle = "cartoon"
        #expect(text.parsedTextStyle == .cartoon)
        text.textStyle = "futuristic"
        #expect(text.parsedTextStyle == .futuristic)
        text.textStyle = "fantasy"
        #expect(text.parsedTextStyle == .fantasy)
        text.textStyle = "curve"
        #expect(text.parsedTextStyle == .curve)
        text.textStyle = "tag"
        #expect(text.parsedTextStyle == .tag)
    }

    @Test func newTextStyles_allHaveANamedFont() {
        let newStyles: [StoryTextStyle] = [
            .calligraphy, .cartoon, .futuristic, .fantasy, .curve, .tag
        ]
        for style in newStyles {
            #expect(style.fontName != nil, "\(style) doit mapper vers une police nommée")
            #expect(!style.displayName.isEmpty)
        }
    }

    @Test func unknownTextStyle_fallsBackToBold() {
        var text = StoryTextObject(id: "t2", text: "X")
        text.textStyle = "style-from-the-future"
        #expect(text.parsedTextStyle == .bold)
    }

    @Test func newTextStyle_roundTripsThroughCodable() throws {
        let text = StoryTextObject(id: "t3", text: "Graffiti", textStyle: "tag")
        let data = try JSONEncoder().encode(text)
        let decoded = try JSONDecoder().decode(StoryTextObject.self, from: data)
        #expect(decoded.textStyle == "tag")
        #expect(decoded.parsedTextStyle == .tag)
    }

    @Test func newFrameShapes_roundTripThroughCodable() throws {
        for raw in ["diamond", "cloud", "speech"] {
            let text = StoryTextObject(id: "t4-\(raw)", text: "Bulle",
                                       backgroundStyle: .solid(hex: "000000"),
                                       frameShape: raw)
            let data = try JSONEncoder().encode(text)
            let decoded = try JSONDecoder().decode(StoryTextObject.self, from: data)
            #expect(decoded.frameShape == raw)
            #expect(decoded.parsedFrameShape == StoryTextFrameShape(rawValue: raw))
        }
    }

    @Test func frameShapes_usesCustomPath_splitsCornerFromPathBased() {
        #expect(!StoryTextFrameShape.rounded.usesCustomPath)
        #expect(!StoryTextFrameShape.pill.usesCustomPath)
        #expect(!StoryTextFrameShape.rectangle.usesCustomPath)
        #expect(StoryTextFrameShape.diamond.usesCustomPath)
        #expect(StoryTextFrameShape.cloud.usesCustomPath)
        #expect(StoryTextFrameShape.speech.usesCustomPath)
    }

    @Test func unknownFrameShape_fallsBackToRounded() {
        var text = StoryTextObject(id: "t5", text: "X")
        text.frameShape = "dodecahedron"
        #expect(text.parsedFrameShape == .rounded)
    }
}
