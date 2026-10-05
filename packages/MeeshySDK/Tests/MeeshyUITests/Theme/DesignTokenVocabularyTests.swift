import XCTest
import SwiftUI
import UIKit
@testable import MeeshyUI

final class DesignTokenVocabularyTests: XCTestCase {

    private func rgba(_ color: Color) -> [Double] {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        UIColor(color).getRed(&r, green: &g, blue: &b, alpha: &a)
        return [r, g, b, a].map { (Double($0) * 1000).rounded() / 1000 }
    }

    private func assertSameColor(_ lhs: Color, _ rhs: Color, _ label: String,
                                 file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertEqual(rgba(lhs), rgba(rhs), label, file: file, line: line)
    }

    private func assertStrictlyIncreasing(_ values: [CGFloat], _ label: String,
                                          file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertEqual(values, values.sorted(), label, file: file, line: line)
        XCTAssertEqual(Set(values).count, values.count, label, file: file, line: line)
    }

    // MARK: - Échelles

    func test_spacingScale_pinsEveryStepInOrder() {
        let scale = [MeeshySpacing.xxs, MeeshySpacing.xs, MeeshySpacing.xsPlus, MeeshySpacing.sm,
                     MeeshySpacing.smPlus, MeeshySpacing.md, MeeshySpacing.mdPlus, MeeshySpacing.lg,
                     MeeshySpacing.xl, MeeshySpacing.xxl, MeeshySpacing.xxxl]
        XCTAssertEqual(scale, [2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 32])
        assertStrictlyIncreasing(scale, "MeeshySpacing")
    }

    func test_radiusScale_pinsEveryStepInOrder() {
        let scale = [MeeshyRadius.xxs, MeeshyRadius.xs, MeeshyRadius.sm, MeeshyRadius.smPlus,
                     MeeshyRadius.md, MeeshyRadius.lg, MeeshyRadius.lgPlus, MeeshyRadius.xl,
                     MeeshyRadius.xlPlus, MeeshyRadius.xxl]
        XCTAssertEqual(scale, [4, 8, 10, 12, 14, 16, 18, 20, 22, 24])
        assertStrictlyIncreasing(scale, "MeeshyRadius")
        XCTAssertEqual(MeeshyRadius.full, .infinity)
    }

    func test_fontScale_pinsEveryStepInOrder() {
        let scale = [MeeshyFont.microSize, MeeshyFont.captionSize, MeeshyFont.footnoteSize,
                     MeeshyFont.smallSize, MeeshyFont.subheadSize, MeeshyFont.labelSize,
                     MeeshyFont.bodySize, MeeshyFont.calloutSize, MeeshyFont.headlineSize,
                     MeeshyFont.subtitleSize, MeeshyFont.title3Size, MeeshyFont.titleSize,
                     MeeshyFont.displaySize, MeeshyFont.largeTitleSize]
        XCTAssertEqual(scale, [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 28, 34])
        assertStrictlyIncreasing(scale, "MeeshyFont")
    }

    func test_iconScale_pinsEveryStepInOrder() {
        let scale = [MeeshyIconSize.xxs, MeeshyIconSize.xs, MeeshyIconSize.sm, MeeshyIconSize.md,
                     MeeshyIconSize.lg, MeeshyIconSize.xl, MeeshyIconSize.xxl, MeeshyIconSize.xxxl,
                     MeeshyIconSize.hero]
        XCTAssertEqual(scale, [10, 12, 14, 16, 18, 20, 22, 28, 48])
        assertStrictlyIncreasing(scale, "MeeshyIconSize")
    }

    func test_controlScale_pinsEveryStepInOrder() {
        let scale = [MeeshyControlSize.small, MeeshyControlSize.compact, MeeshyControlSize.regular,
                     MeeshyControlSize.large, MeeshyControlSize.tapTarget, MeeshyControlSize.buttonHeight]
        XCTAssertEqual(scale, [28, 32, 36, 40, 44, 52])
        assertStrictlyIncreasing(scale, "MeeshyControlSize")
    }

    func test_tapTarget_isAppleMinimumAndSheetButtonsReachIt() {
        XCTAssertEqual(MeeshyControlSize.tapTarget, 44)
        XCTAssertGreaterThanOrEqual(MeeshyControlSize.buttonHeight, MeeshyControlSize.tapTarget)
    }

    func test_borderScale_pinsEveryStepInOrder() {
        let scale = [MeeshyBorder.hairline, MeeshyBorder.regular, MeeshyBorder.emphasis, MeeshyBorder.strong]
        XCTAssertEqual(scale, [0.5, 1, 1.5, 2])
        assertStrictlyIncreasing(scale, "MeeshyBorder")
    }

    func test_opacityScale_pinsEveryStepInOrderInsideTheUnitInterval() {
        let scale = [MeeshyOpacity.faint, MeeshyOpacity.subtle, MeeshyOpacity.light, MeeshyOpacity.medium,
                     MeeshyOpacity.strong, MeeshyOpacity.heavy, MeeshyOpacity.intense]
        XCTAssertEqual(scale, [0.04, 0.08, 0.15, 0.3, 0.5, 0.7, 0.85])
        XCTAssertEqual(scale, scale.sorted())
        XCTAssertTrue(scale.allSatisfy { $0 > 0 && $0 < 1 })
    }

    // MARK: - Couleurs

    func test_openHues_matchTheirHexAndTwin() {
        let hues: [(Color, String, String)] = [
            (MeeshyColors.blue500, MeeshyColors.blue500Hex, "3B82F6"),
            (MeeshyColors.orange500, MeeshyColors.orange500Hex, "F97316"),
            (MeeshyColors.amber500, MeeshyColors.amber500Hex, "F59E0B"),
        ]
        for (color, twin, hex) in hues {
            XCTAssertEqual(twin, hex)
            assertSameColor(color, Color(hex: hex), hex)
        }
    }

    func test_openHues_keepTheRoleTokensThatShareTheirValue() {
        assertSameColor(MeeshyColors.blue500, MeeshyColors.pinnedBlue, "pinnedBlue")
        assertSameColor(MeeshyColors.orange500, MeeshyColors.stateEphemeral, "stateEphemeral")
    }

    func test_tilePalette_matchesItsHexAndTwin() {
        let tiles: [(Color, String, String)] = [
            (MeeshyColors.tileCoral, MeeshyColors.tileCoralHex, "FF6B6B"),
            (MeeshyColors.tileSaffron, MeeshyColors.tileSaffronHex, "F8B500"),
            (MeeshyColors.tileBlue, MeeshyColors.tileBlueHex, "3498DB"),
            (MeeshyColors.tileAmethyst, MeeshyColors.tileAmethystHex, "9B59B6"),
            (MeeshyColors.tileSky, MeeshyColors.tileSkyHex, "45B7D1"),
            (MeeshyColors.tileEmerald, MeeshyColors.tileEmeraldHex, "2ECC71"),
            (MeeshyColors.tileTeal, MeeshyColors.tileTealHex, "4ECDC4"),
            (MeeshyColors.tileCyan, MeeshyColors.tileCyanHex, "08D9D6"),
            (MeeshyColors.tileRose, MeeshyColors.tileRoseHex, "FF2E63"),
        ]
        for (color, twin, hex) in tiles {
            XCTAssertEqual(twin, hex)
            assertSameColor(color, Color(hex: hex), hex)
        }
        XCTAssertEqual(Set(tiles.map { $0.2 }).count, tiles.count)
    }

    func test_namedSurfaces_areTheThemeBackgroundStops() {
        assertSameColor(MeeshyColors.surfaceDarkBase, MeeshyColors.backgroundPrimary(isDark: true), "09090B")
        assertSameColor(MeeshyColors.surfaceDarkRaised, MeeshyColors.backgroundSecondary(isDark: true), "13111C")
        assertSameColor(MeeshyColors.surfaceLightRaised, MeeshyColors.backgroundSecondary(isDark: false), "F8F7FF")
        assertSameColor(MeeshyColors.surfaceDarkDeep, Color(hex: "0F0D19"), "0F0D19")
        assertSameColor(MeeshyColors.surfaceDarkInput, Color(hex: "16142A"), "16142A")
        assertSameColor(MeeshyColors.surfaceLightMist, Color(hex: "FAFAFF"), "FAFAFF")
        assertSameColor(MeeshyColors.surfaceLightInput, Color(hex: "F5F3FF"), "F5F3FF")
    }

    func test_blockedNeutral_matchesItsHexAndTwin() {
        XCTAssertEqual(MeeshyColors.blockedNeutralHex, "888888")
        assertSameColor(MeeshyColors.blockedNeutral, Color(hex: "888888"), "888888")
    }

    func test_mediaChrome_isLightInkOverDarkVeils() {
        assertSameColor(MeeshyColors.mediaChromeForeground, .white, "foreground")
        assertSameColor(MeeshyColors.mediaChromeSecondary, Color.white.opacity(0.85), "secondary")
        assertSameColor(MeeshyColors.mediaChromeTertiary, Color.white.opacity(0.7), "tertiary")
        assertSameColor(MeeshyColors.mediaChromeFill, Color.black.opacity(0.35), "fill")
        assertSameColor(MeeshyColors.mediaScrim, Color.black.opacity(0.5), "scrim")
    }

    func test_adaptiveVeils_pinBothSchemes() {
        assertSameColor(MeeshyColors.surfaceFill(isDark: true), Color.white.opacity(0.06), "surfaceFill dark")
        assertSameColor(MeeshyColors.surfaceFill(isDark: false), Color.black.opacity(0.04), "surfaceFill light")
        assertSameColor(MeeshyColors.controlFill(isDark: true), Color.white.opacity(0.1), "controlFill dark")
        assertSameColor(MeeshyColors.controlFill(isDark: false), Color.black.opacity(0.05), "controlFill light")
        assertSameColor(MeeshyColors.hairline(isDark: true), Color.white.opacity(0.08), "hairline dark")
        assertSameColor(MeeshyColors.hairline(isDark: false), Color.black.opacity(0.05), "hairline light")
    }
}
