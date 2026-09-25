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
