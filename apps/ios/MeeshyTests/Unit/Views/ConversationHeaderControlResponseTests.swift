import XCTest
import MeeshyUI
@testable import Meeshy

/// #17095 — les icônes de l'en-tête de conversation répondent au doigt comme le
/// bouton d'appel : un cercle de verre INTERACTIF de 28 pt sur une cible de
/// 44 pt, la surbrillance système dès le toucher, et un menu d'appui long
/// présenté par un `Menu` natif à action primaire — jamais un `.contextMenu`,
/// qui soulève un aperçu après un délai et double le geste.
@MainActor
final class ConversationHeaderControlResponseTests: XCTestCase {

    private func source(_ relativeToApp: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativeToApp)
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private static let views = "Meeshy/Features/Main/Views/"
    private static let glyphFile = views + "ConversationLayers/ConversationHeaderGlassGlyph.swift"

    private static let headerFiles = [
        views + "ConversationLayers/ConversationHeaderCallButton.swift",
        views + "ConversationView+HeaderControls.swift",
        views + "ConversationExpandedHeaderBand.swift",
        views + "ConversationGuestHeaderBar.swift",
        views + "ConversationView+Header.swift",
        views + "ConversationHelperViews.swift",
        views + "ConversationHeaderFlame.swift",
        "Meeshy/Features/Focal/Lens/ReadingModeChip.swift",
    ]

    // MARK: - Le gabarit partagé

    func test_style_isTheCallButtonTemplate() {
        XCTAssertEqual(ConversationHeaderGlassGlyph.diameter, MeeshyControlSize.small)
        XCTAssertEqual(ConversationHeaderGlassGlyph.diameter, 28)
        XCTAssertEqual(ConversationHeaderGlassGlyph.glassTintOpacity, 0.4)
        XCTAssertTrue(ConversationHeaderGlassGlyph.isGlassInteractive,
                      "le verre réagit au doigt dès le toucher, comme celui de l'appel")
        XCTAssertGreaterThanOrEqual(MeeshyControlSize.tapTarget, 44)
    }

    func test_glyph_appliesInteractiveGlassBeforeTheTapTarget() throws {
        let glyph = try source(Self.glyphFile)
        guard let glass = glyph.range(of: ".adaptiveGlass(in: Circle(), tint: Color(hex: accentColor).opacity(Self.glassTintOpacity), interactive: Self.isGlassInteractive)"),
              let target = glyph.range(of: ".meeshyTapTarget()", range: glass.upperBound..<glyph.endIndex) else {
            return XCTFail("le glyphe partagé pose le verre interactif PUIS la cible de 44 pt")
        }
        XCTAssertLessThan(glass.lowerBound, target.lowerBound,
                          "le verre est dimensionné aux bornes courantes : après la cible, le cercle passerait de 28 à 44 pt")
    }

    func test_everyHeaderIcon_drawsTheSharedGlyph() throws {
        let sites: [(file: String, what: String)] = [
            (Self.views + "ConversationLayers/ConversationHeaderCallButton.swift", "appel"),
            (Self.views + "ConversationView+HeaderControls.swift", "recherche"),
            (Self.views + "ConversationExpandedHeaderBand.swift", "ouvrir la conversation (aperçu)"),
            (Self.views + "ConversationGuestHeaderBar.swift", "partager, fermer (invité)"),
        ]
        for site in sites {
            XCTAssertTrue(try source(site.file).contains("ConversationHeaderGlassGlyph("),
                          "\(site.what) : l'icône dessine le glyphe partagé de l'en-tête")
        }
    }

    func test_noHeaderFile_recopiesTheCircleGlass() throws {
        for file in Self.headerFiles {
            XCTAssertFalse(try source(file).contains(".adaptiveGlass(in: Circle()"),
                           "\(file) recopie le cercle de verre : il vit UNE fois, dans ConversationHeaderGlassGlyph")
        }
    }

    // MARK: - La surbrillance dès le toucher

    func test_noHeaderControl_optsOutOfTheSystemPressHighlight() throws {
        for file in Self.headerFiles {
            XCTAssertFalse(try source(file).contains(".buttonStyle(.plain)"),
                           "\(file) : `.plain` retire la surbrillance au toucher que porte l'appel")
        }
    }

    func test_backButton_answersAtTouchDown_notAfterRelease() throws {
        let back = try source(Self.views + "ConversationHelperViews.swift")
        guard let start = back.range(of: "struct ThemedBackButton"),
              let end = back.range(of: "struct ThemedAvatarButton") else {
            return XCTFail("ThemedBackButton introuvable")
        }
        let body = String(back[start.lowerBound..<end.lowerBound])
        XCTAssertFalse(body.contains("isPressed = true"),
                       "une échelle posée dans l'action ne joue qu'au relâcher : le retour d'appui arrive après le geste")
        XCTAssertTrue(body.contains(".adaptiveGlass(in: Capsule(), tint: Color(hex: color).opacity(ConversationHeaderGlassGlyph.glassTintOpacity), interactive: ConversationHeaderGlassGlyph.isGlassInteractive)"),
                      "la capsule du retour est du verre interactif, teinté comme l'appel")
        XCTAssertTrue(body.contains(".meeshyTapTarget()"), "cible de 44 pt")
    }

    func test_search_answersWithTheHeaderHaptic() throws {
        let controls = try source(Self.views + "ConversationView+HeaderControls.swift")
        guard let start = controls.range(of: "struct ConversationHeaderSearchButton") else {
            return XCTFail("ConversationHeaderSearchButton introuvable")
        }
        XCTAssertTrue(controls[start.lowerBound...].contains("HapticFeedback.light()"),
                      "la loupe ouvre la recherche avec l'haptique légère des autres actions de l'en-tête")
    }

    // MARK: - L'appui long présente un Menu natif

    func test_readingModeChip_tapCycles_longPressOpensANativeMenu() throws {
        let chip = try source("Meeshy/Features/Focal/Lens/ReadingModeChip.swift")
        XCTAssertTrue(chip.contains("Menu {") && chip.contains("primaryAction: {") && chip.contains("onCycle()"),
                      "toucher la puce fait défiler les modes, l'appui long ouvre le menu — un seul contrôle, comme l'appel")
        XCTAssertFalse(chip.contains(".contextMenu"),
                       "un `.contextMenu` soulève un aperçu après un délai : l'appui long passe par le Menu")
        XCTAssertTrue(chip.contains(".adaptiveGlass(in: Capsule(), tint: Color(hex: model.accentHex).opacity(ConversationHeaderGlassGlyph.glassTintOpacity), interactive: ConversationHeaderGlassGlyph.isGlassInteractive)"),
                      "la capsule de la puce est du verre interactif, teinté comme l'appel")
        XCTAssertTrue(chip.contains(".meeshyTapTarget()"))
    }

    func test_directTitle_tapOpensDetails_longPressOpensANativeMenu() throws {
        let controls = try source(Self.views + "ConversationView+HeaderControls.swift")
        guard let start = controls.range(of: "private var titleButton"),
              let end = controls.range(of: "private var titleLabel") else {
            return XCTFail("bornes du bouton-titre introuvables")
        }
        let title = String(controls[start.lowerBound..<end.lowerBound])
        XCTAssertTrue(title.contains("Menu {") && title.contains("primaryAction: {") && title.contains("openInfo()"),
                      "en direct, toucher le titre ouvre les détails et l'appui long propose détails ou profil")
        XCTAssertFalse(title.contains(".contextMenu"))
    }
}
