import XCTest
import SwiftUI
@testable import Meeshy

/// #7997 — en Dynamic Type XXXL, la barre d'outils du composer (protections,
/// effets, tonalité, pastille de langue) demandait 493 pt sur un iPhone de
/// 402 pt. Un `HStack` dont les enfants ne se compressent pas rend une largeur
/// PLUS GRANDE que celle qu'on lui propose, et chaque parent non borné la
/// reprend : tout l'écran de conversation était mis en page sur 493 pt puis
/// recentré (bouton joindre à x = −53, ❤️ à x = 419).
///
/// Le témoin mesure la bande par `sizeThatFits` à la largeur de l'appareil :
/// quelle que soit la largeur de son contenu, elle ne doit jamais en rendre
/// davantage.
@MainActor
final class ComposerToolbarStripWidthTests: XCTestCase {

    private let deviceWidth: CGFloat = 402

    private func measuredWidth<V: View>(_ view: V) -> CGFloat {
        let host = UIHostingController(rootView: view)
        return host.sizeThatFits(in: CGSize(width: deviceWidth, height: .greatestFiniteMagnitude)).width
    }

    private func strip(leadingWidth: CGFloat) -> some View {
        ComposerToolbarStrip {
            Color.red.frame(width: leadingWidth, height: 30)
        } trailing: {
            Text("480/500")
        }
    }

    /// Fusible : le harnais VOIT un débordement. Sans lui, une mesure qui
    /// rendrait toujours la largeur proposée passerait pour une preuve.
    func test_harness_seesAnUnboundedRowOverflow() {
        let row = HStack(spacing: 6) {
            Color.red.frame(width: 600, height: 30)
            Spacer()
        }
        XCTAssertGreaterThan(measuredWidth(row), deviceWidth)
    }

    func test_strip_widerContent_neverExceedsTheProposedWidth() {
        XCTAssertLessThanOrEqual(measuredWidth(strip(leadingWidth: 600)), deviceWidth)
    }

    func test_strip_narrowContent_stillFillsTheRow() {
        XCTAssertEqual(measuredWidth(strip(leadingWidth: 120)), deviceWidth, accuracy: 0.5)
    }

    /// La barre réelle passe par la bande — sinon le témoin ci-dessus
    /// garderait un composant que personne n'utilise.
    func test_topToolbar_isBuiltOnTheStrip() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Components/UniversalComposerBar+Toolbar.swift")
        let code = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
        guard let start = code.range(of: "var topToolbar: some View {") else {
            return XCTFail("topToolbar introuvable")
        }
        let body = code[start.upperBound...].prefix(200)
        XCTAssertTrue(body.contains("ComposerToolbarStrip"),
                      "topToolbar doit être posé dans ComposerToolbarStrip (#7997)")
    }
}

/// #9082 — directive porteur 2026-10-02 : la caméra se pose à l'angle droit du
/// verre, juste avant le ⌄ ; le sticker prend la place de l'indicateur de
/// tonalité. Chaque porte n'existe que si l'hôte sait l'ouvrir (loi 4).
final class ComposerGlassDoorsTests: XCTestCase {

    func test_trailing_cameraSitsJustBeforeTheFold() {
        XCTAssertEqual(ComposerGlassDoors.trailing(offersLibrary: false, offersCamera: true, offersFold: true), [.camera, .fold])
    }

    func test_trailing_withoutCameraHost_keepsOnlyTheFold() {
        XCTAssertEqual(ComposerGlassDoors.trailing(offersLibrary: false, offersCamera: false, offersFold: true), [.fold])
        XCTAssertEqual(ComposerGlassDoors.trailing(offersLibrary: false, offersCamera: true, offersFold: false), [.camera])
        XCTAssertEqual(ComposerGlassDoors.trailing(offersLibrary: false, offersCamera: false, offersFold: false), [])
    }

    /// #9120 — la photothèque (images ET vidéos) se pose À CÔTÉ de la caméra.
    func test_trailing_librarySitsJustBeforeTheCamera() {
        XCTAssertEqual(ComposerGlassDoors.trailing(offersLibrary: true, offersCamera: true, offersFold: true), [.library, .camera, .fold])
        XCTAssertEqual(ComposerGlassDoors.trailing(offersLibrary: true, offersCamera: false, offersFold: false), [.library])
    }

    func test_toolbar_libraryDoorOpensThePhotoLibrary() throws {
        let toolbar = try String(
            contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent().deletingLastPathComponent()
                .deletingLastPathComponent().deletingLastPathComponent()
                .appendingPathComponent("Meeshy/Features/Main/Components/UniversalComposerBar+Toolbar.swift"),
            encoding: .utf8)
        XCTAssertTrue(toolbar.contains("offersLibrary: onPhotoLibrary != nil"), "La porte n'existe que si l'hôte sait ouvrir la photothèque.")
        XCTAssertTrue(toolbar.contains("case .library:"), "La bande rend la porte photothèque.")
    }

    func test_toolbar_stickerReplacesTheMoodIndicator() throws {
        let toolbar = try String(
            contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent().deletingLastPathComponent()
                .deletingLastPathComponent().deletingLastPathComponent()
                .appendingPathComponent("Meeshy/Features/Main/Components/UniversalComposerBar+Toolbar.swift"),
            encoding: .utf8)
        XCTAssertFalse(toolbar.contains("textAnalyzer.sentiment"), "L'indicateur d'humeur quitte la barre d'outils.")
        XCTAssertTrue(toolbar.contains("onRequestStickerPicker"), "Le sticker ouvre le sélecteur de stickers.")
        XCTAssertTrue(toolbar.contains("ComposerGlassDoors.trailing("), "L'angle droit consulte la loi.")
    }
    private func source(_ name: String) throws -> String {
        try String(
            contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent().deletingLastPathComponent()
                .deletingLastPathComponent().deletingLastPathComponent()
                .appendingPathComponent("Meeshy/Features/Main/Components/\(name)"),
            encoding: .utf8)
    }

    func test_glassDoors_glyphWeight_isRegular() {
        XCTAssertEqual(ComposerGlassDoors.glyphWeight, .regular)
    }

    func test_toolbar_doorsDrawWithTheSharedGlyphWeight() throws {
        let toolbar = try source("UniversalComposerBar+Toolbar.swift")
        XCTAssertTrue(toolbar.contains(".font(.callout.weight(ComposerGlassDoors.glyphWeight))"), "Les portes de verre prennent le trait des icônes de gauche.")
        XCTAssertFalse(toolbar.contains(".font(.callout.weight(.semibold))"), "Plus de trait semibold sur les portes de verre.")
    }

    func test_attachCarousel_doesNotRepeatTheGlassDoors() throws {
        let attachments = try source("UniversalComposerBar+Attachments.swift")
        XCTAssertFalse(attachments.contains("id: \"camera\""), "La caméra vit dans la barre, plus dans le (+).")
        XCTAssertFalse(attachments.contains("id: \"sticker\""), "Le sticker vit dans la barre, plus dans le (+).")
    }
}
