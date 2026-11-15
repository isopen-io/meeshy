import CoreText
import UIKit
import XCTest
@testable import Meeshy

/// **Les polices d'apparat des cadres** (§ 5.6, D10, #10158) : embarquées telles que
/// distribuées en amont, enregistrées À LA DEMANDE (jamais au démarrage), et
/// réservées au latin — toute autre écriture prend la pile système, choisie par
/// les plages Unicode du texte, jamais par la langue de l'interface.
final class GloryFrameFontsTests: XCTestCase {

    private func family(_ font: CTFont) -> String {
        CTFontCopyFamilyName(font) as String
    }

    private func width(_ text: String, _ font: CTFont) -> CGFloat {
        NSAttributedString(string: text, attributes: [.font: font as UIFont]).size().width
    }

    func test_cinzel_isRegisteredOnDemand_andDrawsItsOwnGlyphs() throws {
        let font = GloryFrameFonts.shared.font(.cinzel, weight: 700, size: 40, for: "SAVANE")

        XCTAssertEqual(family(font), "Cinzel")
        var glyph: CGGlyph = 0
        var character: UniChar = UniChar(UnicodeScalar("A").value)
        XCTAssertTrue(CTFontGetGlyphsForCharacters(font, &character, &glyph, 1))
        XCTAssertNotEqual(glyph, 0)
        let system = UIFont.systemFont(ofSize: 40, weight: .bold) as CTFont
        XCTAssertNotEqual(width("SAVANE", font), width("SAVANE", system), accuracy: 0.5, "le titre se mesure dans SA police")
    }

    func test_theWeight_reachesTheVariableAxis() {
        let regular = GloryFrameFonts.shared.font(.cinzel, weight: 400, size: 40, for: "AMBASSADEUR")
        let black = GloryFrameFonts.shared.font(.cinzel, weight: 900, size: 40, for: "AMBASSADEUR")

        XCTAssertGreaterThan(width("AMBASSADEUR", black), width("AMBASSADEUR", regular))
    }

    func test_everyFamily_resolvesToItself() {
        for family in GloryFrameFontFamily.allCases {
            let font = GloryFrameFonts.shared.font(family, weight: 700, size: 24, for: "Meeshy")
            XCTAssertEqual(self.family(font), family.rawValue, "\(family)")
        }
    }

    func test_cormorantItalic_isItalic() {
        let font = GloryFrameFonts.shared.font(.cormorantGaramond, weight: 500, italic: true, size: 24, for: "Immortalisé")

        XCTAssertEqual(family(font), "Cormorant Garamond")
        XCTAssertTrue(CTFontGetSymbolicTraits(font).contains(.traitItalic))
    }

    func test_cinzelDecorative_picksItsStaticWeight() {
        let bold = GloryFrameFonts.shared.font(.cinzelDecorative, weight: 700, size: 24, for: "Mythe")
        let black = GloryFrameFonts.shared.font(.cinzelDecorative, weight: 900, size: 24, for: "Mythe")

        XCTAssertEqual(CTFontCopyPostScriptName(bold) as String, "CinzelDecorative-Bold")
        XCTAssertEqual(CTFontCopyPostScriptName(black) as String, "CinzelDecorative-Black")
    }

    func test_nonLatinText_takesTheSystemStack_chosenByItsUnicodeRanges() {
        for text in ["Привет", "你好", "こんにちは", "שלום", "مرحبا", "Γειά σου", "नमस्ते", "Léa 😀"] {
            let font = GloryFrameFonts.shared.font(.cinzel, weight: 700, size: 24, for: text)
            XCTAssertNotEqual(family(font), "Cinzel", text)
        }
    }

    func test_accentedLatin_keepsTheFrameFont() {
        for text in ["Élégance", "ŒUVRE", "Señora", "Łódź", "Nguyễn", "12 · 2026"] {
            let font = GloryFrameFonts.shared.font(.cinzel, weight: 700, size: 24, for: text)
            XCTAssertEqual(family(font), "Cinzel", text)
        }
    }

    func test_everyFamilyFile_shipsInTheBundle_withItsLicense() {
        for family in GloryFrameFontFamily.allCases {
            for file in family.files {
                XCTAssertNotNil(Bundle.main.url(forResource: file, withExtension: "ttf"), file)
            }
        }
        XCTAssertNotNil(Bundle.main.url(forResource: "GloryFrameFonts-OFL", withExtension: "txt"))
    }

    /// Jamais au démarrage : ni `UIAppFonts`, ni un appel depuis l'entrée de l'app.
    func test_theFonts_areNeverRegisteredAtLaunch() throws {
        var root = URL(fileURLWithPath: #filePath)
        for _ in 0..<4 { root.deleteLastPathComponent() }
        let plist = try String(contentsOf: root.appendingPathComponent("Meeshy/Info.plist"), encoding: .utf8)
        XCTAssertFalse(plist.contains("UIAppFonts"))
        for entry in ["Meeshy/MeeshyApp.swift", "Meeshy/AppDelegate.swift"] {
            let source = try String(contentsOf: root.appendingPathComponent(entry), encoding: .utf8)
            XCTAssertFalse(source.contains("GloryFrameFonts"), entry)
        }
    }
}
