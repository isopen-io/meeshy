import XCTest
import SwiftUI
import UIKit
@testable import MeeshyUI

/// K03 — ce que le contrôle RENDU garantit : rien sous deux options, une taille
/// qui ne dépend pas de la sélection, des contrastes tenus sur les jetons.
@MainActor
final class MeeshySegmentedRenderTests: XCTestCase {

    private static let aa = 4.5

    func test_moinsDeDeuxOptions_neRendRien() {
        let size = Self.fittingSize(of: Self.control(titles: ["Seul"], selection: 0), width: 320)
        XCTAssertEqual(size.width, 0, accuracy: 0.5)
        XCTAssertEqual(size.height, 0, accuracy: 0.5)
    }

    func test_laTailleDuControle_neDependPasDeLaSelection() {
        let titles = ["Fin", "Normal", "Semi-gras", "Gras"]
        for width in [CGFloat(320), 200] {
            let sizes = (0..<titles.count).map { Self.fittingSize(of: Self.control(titles: titles, selection: $0), width: width) }
            for size in sizes {
                XCTAssertEqual(size.width, sizes[0].width, accuracy: 0.5, "largeur proposée \(width)")
                XCTAssertEqual(size.height, sizes[0].height, accuracy: 0.5, "largeur proposée \(width)")
            }
        }
    }

    func test_unePisteDeQuaranteQuatrePoints_auRepos() {
        let size = Self.fittingSize(of: Self.control(titles: ["Ajuster", "Remplir"], selection: 0), width: 320)
        XCTAssertEqual(size.width, 320, accuracy: 0.5)
        XCTAssertGreaterThanOrEqual(size.height, MeeshyControlSize.tapTarget - 0.5)
    }

    func test_tropLargePourUneRangee_leChoixSeReplieEnRangeesSansDeborder() {
        let titles = ["Sur la scène", "Fond de la scène", "Pièce du post"]
        let oneRow = Self.fittingSize(of: Self.control(titles: titles, selection: 1), width: 1000)
        let folded = Self.fittingSize(of: Self.control(titles: titles, selection: 1), width: 160)
        XCTAssertEqual(folded.width, 160, accuracy: 0.5)
        XCTAssertGreaterThan(folded.height, oneRow.height + MeeshyControlSize.regular - 1)
    }

    func test_tonMedia_encreSurPastille_etEncreSurPiste_dansUnPanneauOpaque() {
        let palette = MeeshySegmentedPalette(tone: .media, isDark: false)
        XCTAssertEqual(palette, MeeshySegmentedPalette(tone: .media, isDark: true), "le ton media ne suit pas le thème")
        XCTAssertEqual(Self.ratio(palette.currentInk, on: palette.pill), 15.99, accuracy: 0.05)
        for panel in [MeeshyColors.backgroundPrimary(isDark: true), MeeshyColors.backgroundSecondary(isDark: true)] {
            let track = Self.composite(palette.track, over: Self.rgb(panel))
            XCTAssertGreaterThanOrEqual(Self.ratio(palette.restInk, onRGB: track), Self.aa)
            XCTAssertGreaterThanOrEqual(Self.ratio(palette.pill, onRGB: track), Self.aa)
        }
    }

    func test_tonTheme_tientAA_enClairEtEnSombre() {
        for isDark in [false, true] {
            let palette = MeeshySegmentedPalette(tone: .theme, isDark: isDark)
            XCTAssertGreaterThanOrEqual(Self.ratio(palette.currentInk, on: palette.pill), Self.aa, "isDark=\(isDark)")
            for panel in [MeeshyColors.backgroundPrimary(isDark: isDark), MeeshyColors.backgroundSecondary(isDark: isDark)] {
                let track = Self.composite(palette.track, over: Self.rgb(panel))
                XCTAssertGreaterThanOrEqual(Self.ratio(palette.restInk, onRGB: track), Self.aa, "isDark=\(isDark)")
                XCTAssertGreaterThanOrEqual(Self.ratio(palette.pill, onRGB: track), Self.aa, "isDark=\(isDark)")
            }
        }
    }

    // MARK: - Aides

    private static func control(titles: [String], selection: Int) -> some View {
        MeeshySegmented(
            "Choix",
            selection: .constant(selection),
            options: titles.enumerated().map { MeeshySegmentedOption(id: $0.offset, title: $0.element) }
        )
    }

    private static func fittingSize<V: View>(of view: V, width: CGFloat) -> CGSize {
        UIHostingController(rootView: view)
            .sizeThatFits(in: CGSize(width: width, height: .greatestFiniteMagnitude))
    }

    private typealias RGB = (red: Double, green: Double, blue: Double)

    private static func rgba(_ color: Color) -> (RGB, Double) {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        _ = UIColor(color).getRed(&r, green: &g, blue: &b, alpha: &a)
        return ((Double(r), Double(g), Double(b)), Double(a))
    }

    private static func rgb(_ color: Color) -> RGB {
        rgba(color).0
    }

    private static func composite(_ color: Color, over base: RGB) -> RGB {
        let (fg, alpha) = rgba(color)
        return (fg.red * alpha + base.red * (1 - alpha),
                fg.green * alpha + base.green * (1 - alpha),
                fg.blue * alpha + base.blue * (1 - alpha))
    }

    private static func ratio(_ ink: Color, on background: Color) -> Double {
        ratio(ink, onRGB: rgb(background))
    }

    private static func ratio(_ ink: Color, onRGB background: RGB) -> Double {
        let ink = rgb(ink)
        return CanvasChromeScheme.contrastRatio(
            CanvasChromeScheme.luminance(red: ink.red, green: ink.green, blue: ink.blue),
            CanvasChromeScheme.luminance(red: background.red, green: background.green, blue: background.blue)
        )
    }
}
