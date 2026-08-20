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

    // MARK: - Extension a 18 styles (2026-08-20)

    /// La famille compte DIX-HUIT styles. Le compte est verrouille parce que
    /// trois surfaces en dependent mecaniquement (pickers `allCases`, cycle
    /// d'attributs, chips d'apercu) : un style ajoute sans passer par l'enum
    /// n'existerait nulle part, un style retire casserait des blobs publies.
    @Test func theFamilyCountsEighteenStyles() {
        #expect(StoryTextStyle.allCases.count == 18)
    }

    @Test func extendedTextStyles_parseFromRawValue() {
        var text = StoryTextObject(id: "t3", text: "X")
        let expected: [(String, StoryTextStyle)] = [
            ("italic", .italic), ("retro", .retro), ("elegant", .elegant),
            ("poster", .poster), ("bubble", .bubble), ("note", .note),
            ("brush", .brush),
        ]
        for (raw, style) in expected {
            text.textStyle = raw
            #expect(text.parsedTextStyle == style, "\(raw) doit parser en .\(style)")
        }
    }

    /// « italic » et « retro » sont le vocabulaire HISTORIQUE du lecteur
    /// (`fontForStyle`, chemin texte simple) : des stories publiees les portent
    /// deja, mais l'enum ne les connaissait pas — sur le canvas ils retombaient
    /// en .bold. Les ajouter reunit les deux vocabulaires : ce que le lecteur
    /// sait rendre, le composer sait desormais le produire, et inversement.
    @Test func legacyReaderVocabulary_isNowPartOfTheFamily() {
        var text = StoryTextObject(id: "t4", text: "X")
        text.textStyle = "italic"
        #expect(text.parsedTextStyle == .italic)
        text.textStyle = "retro"
        #expect(text.parsedTextStyle == .retro)
    }

    @Test func extendedTextStyles_allHaveANamedFontAndAName() {
        let extended: [StoryTextStyle] = [
            .italic, .retro, .elegant, .poster, .bubble, .note, .brush
        ]
        for style in extended {
            #expect(style.fontName != nil, "\(style) doit mapper vers une police nommee")
            #expect(!style.displayName.isEmpty)
        }
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
