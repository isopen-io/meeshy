import XCTest
import SwiftUI
import UIKit
import MeeshySDK
@testable import MeeshyUI

/// #10631 — `AppearanceDesignView` : la même clé rend la MÊME tuile (cache borné),
/// l'accent effectif colore les rôles, et un modèle ne se redessine que si son
/// entrée change.
@MainActor
final class AppearanceDesignViewTests: XCTestCase {

    private func design(_ pack: String, _ key: String) throws -> AppearanceDesign {
        try XCTUnwrap(AppearanceCatalog.shared.wallpaper(pack: pack, design: key))
    }

    func test_tileImage_sameKey_returnsTheSameCachedImage() throws {
        AppearanceTileCache.shared.removeAll()
        let zellige = try design("heritages", "zellige")
        let first = AppearanceTileRenderer.tileImage(design: zellige, isDark: false, accentHex: "#6366F1", displayScale: 2)
        let second = AppearanceTileRenderer.tileImage(design: zellige, isDark: false, accentHex: "#6366F1", displayScale: 2)
        XCTAssertNotNil(first)
        XCTAssertTrue(first === second, "la même clé ne redessine pas la tuile")
    }

    func test_tileImage_otherAccentOrScheme_rendersAnotherTile() throws {
        AppearanceTileCache.shared.removeAll()
        let monogramme = try design("essentiels", "monogramme")
        let base = AppearanceTileRenderer.tileImage(design: monogramme, isDark: false, accentHex: "#6366F1", displayScale: 2)
        let accent = AppearanceTileRenderer.tileImage(design: monogramme, isDark: false, accentHex: "#E0604E", displayScale: 2)
        let dark = AppearanceTileRenderer.tileImage(design: monogramme, isDark: true, accentHex: "#6366F1", displayScale: 2)
        XCTAssertFalse(base === accent)
        XCTAssertFalse(base === dark)
    }

    func test_tileImage_hasTheTileSizeTimesScale() throws {
        let zellige = try design("heritages", "zellige")
        let tile = try XCTUnwrap(zellige.tile)
        let image = try XCTUnwrap(AppearanceTileRenderer.tileImage(design: zellige, isDark: false, accentHex: "#6366F1", displayScale: 3))
        XCTAssertEqual(image.size.width, tile.width * tile.scale, accuracy: 0.01)
        XCTAssertEqual(image.scale, 3)
    }

    func test_tileImage_forAnIllustration_isNil() throws {
        XCTAssertNil(AppearanceTileRenderer.tileImage(design: try design("illustrations", "horizon"), isDark: false, accentHex: "#6366F1", displayScale: 2))
    }

    func test_paint_accentRoles_followTheReadersAccent() {
        let palette = AppearanceDesignPalette(base: "#FFFFFF", ink: "#111111", soft: "#EEEEEE", accent: nil)
        XCTAssertEqual(AppearancePaint.hex(.accent, palette: palette, accentHex: "#c0582f"), "#C0582F")
        XCTAssertEqual(AppearancePaint.hex(.ink, palette: palette, accentHex: "#C0582F"), "#111111")
        XCTAssertEqual(
            AppearancePaint.hex(.accentNext, palette: palette, accentHex: "#C0582F"),
            DynamicColorGenerator.hueShiftedHex("#C0582F", degrees: 30)
        )
        XCTAssertEqual(
            AppearancePaint.hex(.accentPrev, palette: palette, accentHex: "#C0582F"),
            DynamicColorGenerator.hueShiftedHex("#C0582F", degrees: -30)
        )
    }

    func test_paint_paletteAccentWins_andABadAccentFallsBackToIndigo() {
        let own = AppearanceDesignPalette(base: "#FFFFFF", ink: "#111111", soft: "#EEEEEE", accent: "#0F6B5C")
        XCTAssertEqual(AppearancePaint.hex(.accent, palette: own, accentHex: "#C0582F"), "#0F6B5C")
        let none = AppearanceDesignPalette(base: "#FFFFFF", ink: "#111111", soft: "#EEEEEE", accent: nil)
        XCTAssertEqual(AppearancePaint.hex(.accent, palette: none, accentHex: "<script>"), "#6366F1")
    }

    func test_origin_bottomEnd_mirrorsInRightToLeft() {
        let drawn = CGSize(width: 100, height: 60)
        let size = CGSize(width: 300, height: 600)
        XCTAssertEqual(AppearanceDesignView.origin(anchor: .bottomEnd, drawn: drawn, in: size, isRTL: false), CGPoint(x: 200, y: 540))
        XCTAssertEqual(AppearanceDesignView.origin(anchor: .bottomEnd, drawn: drawn, in: size, isRTL: true), CGPoint(x: 0, y: 540))
        XCTAssertEqual(AppearanceDesignView.origin(anchor: .bottom, drawn: drawn, in: size, isRTL: false), CGPoint(x: 100, y: 540))
    }

    func test_view_isEquatableOnItsThreeInputs() throws {
        let aurore = try design("essentiels", "aurore")
        let base = AppearanceDesignView(design: aurore, isDark: false, accentHex: "#6366F1")
        XCTAssertEqual(base, AppearanceDesignView(design: aurore, isDark: false, accentHex: "#6366F1"))
        XCTAssertNotEqual(base, AppearanceDesignView(design: aurore, isDark: true, accentHex: "#6366F1"))
        XCTAssertNotEqual(base, AppearanceDesignView(design: aurore, isDark: false, accentHex: "#E0604E"))
    }

    func test_everyBundledDesign_rendersWithoutCrashing() throws {
        for pack in AppearanceCatalog.shared.wallpaperPacks {
            for design in pack.designs {
                let host = UIHostingController(rootView: AppearanceDesignView(design: design, isDark: true, accentHex: "#6366F1").frame(width: 200, height: 400))
                host.view.frame = CGRect(x: 0, y: 0, width: 200, height: 400)
                host.view.layoutIfNeeded()
                XCTAssertNotNil(host.view)
            }
        }
    }
}
