import XCTest
import SwiftUI
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// D-18 bis (2026-09-08, #5625, revue-correction #5559 défaut 1) —
/// `MeeshyColors.textSecondary(isDark: false)` alimente `--color-ios-ink-2`
/// côté web-v3 (`packages/design-tokens/scripts/generate-from-ios.mjs:293,320`),
/// lui-même l'encre de l'APERÇU (dernier message) sur la liste des
/// conversations — la ligne la plus lue de l'écran phare. Elle valait
/// `indigo700.opacity(0.6)` : **2,70–3,12:1** selon le fond, sous AA (4,5:1)
/// dans TOUS les cas, y compris le fond de rangée réel (`backgroundSecondary`
/// `#F8F7FF`). Le pendant SOMBRE (`indigo300`, opaque) n'était pas en cause.
///
/// Patron direct de `LentilleTextMutedContrastAATests` (D-18) : même méthode
/// (composition alpha PUIS luminance relative WCAG), mêmes fonds clairs
/// déclarés. La correction retient le MÊME cran minimal qu'y avait trouvé
/// D-18 pour `indigo700` — `opacity(0.8)` — parce que c'est la même couleur
/// de base sur les mêmes fonds : le point de bascule AA ne dépend que
/// d'eux, jamais du nom du jeton qui les porte.
///
/// **Mutation qui fait rougir ce fichier** : tout retour de
/// `MeeshyColors.textSecondary(isDark: false)` vers une opacité plus faible
/// (ex. réintroduire `0.6`, ou toute valeur encore sous 4,5:1 sur l'un des
/// fonds ci-dessous) fait tomber `test_lightVariant_meetsAA_onEveryDeclaredLightSurface` —
/// qui appelle la fonction source, jamais un littéral recopié.
@MainActor
final class LentilleTextSecondaryContrastAATests: XCTestCase {

    private var aa: Double { WCAGContrast.aaThreshold }

    // MARK: - Fonds clairs déclarés (mêmes que `LentilleTextMutedContrastAATests`)

    private var lightSurfaces: [(name: String, color: Color)] {
        [
            ("backgroundSecondary #F8F7FF (rang Lentille, #5625)", MeeshyColors.backgroundSecondary(isDark: false)),
            ("backgroundPrimary #FFFFFF", Color(hex: "FFFFFF")),
            ("backgroundTertiary #EEF2FF", Color(hex: "EEF2FF")),
        ]
    }

    // MARK: - Conformité (calculée depuis la source, jamais un littéral figé)

    func test_lightVariant_meetsAA_onEveryDeclaredLightSurface() {
        let secondary = MeeshyColors.textSecondary(isDark: false)
        for surface in lightSurfaces {
            let ratio = WCAGContrast.ratioOfTranslucentForeground(secondary, on: surface.color)
            XCTAssertGreaterThanOrEqual(
                ratio, aa,
                "MeeshyColors.textSecondary(isDark: false) sur \(surface.name) : " +
                "\(WCAGContrast.fmt(ratio)):1 — sous le seuil AA \(aa):1"
            )
        }
    }

    /// Le pendant sombre n'a jamais été en cause (`indigo300` opaque) — ce
    /// témoin garde la régression inverse : qu'il ne devienne jamais, lui,
    /// translucide sous AA.
    func test_darkVariant_meetsAA_onDeclaredDarkSurface() {
        let ratio = WCAGContrast.ratioOfTranslucentForeground(
            MeeshyColors.textSecondary(isDark: true), on: MeeshyColors.backgroundSecondary(isDark: true)
        )
        XCTAssertGreaterThanOrEqual(ratio, aa, "textSecondary(isDark: true) : \(WCAGContrast.fmt(ratio)):1")
    }

    /// Re-mesure EXACTE du fond de rangée réel — 4,76:1 attendu (identique à
    /// `textMuted`, même base `indigo700`, mêmes fonds).
    func test_lentilleRow_preview_meetsAA_onTheRealRowBackground() {
        let ratio = WCAGContrast.ratioOfTranslucentForeground(
            MeeshyColors.textSecondary(isDark: false), on: MeeshyColors.backgroundSecondary(isDark: false)
        )
        XCTAssertGreaterThanOrEqual(ratio, aa, "aperçu Lentille CLAIR : \(WCAGContrast.fmt(ratio)):1")
        XCTAssertEqual(ratio, 4.76, accuracy: 0.02, "mesure attendue re-prouvée (#5625) : ≈4,76:1")
    }

    // MARK: - RED : la formule D'AVANT #5625 était rouge (garde-fou historique)

    func test_beforeFix_oldFormula_wasBelowAA_documented() {
        let old = WCAGContrast.ratioOfTranslucentForeground(
            MeeshyColors.indigo700.opacity(0.6), on: MeeshyColors.backgroundSecondary(isDark: false)
        )
        XCTAssertLessThan(
            old, aa,
            "régression du garde-fou : indigo700.opacity(0.6) sur #F8F7FF mesure \(WCAGContrast.fmt(old)):1 — " +
            "attendu < 4,5:1 (c'est le défaut #5625/#5559 d'origine, ~2,70:1)"
        )
        XCTAssertEqual(old, 2.70, accuracy: 0.02)
    }

    // MARK: - RE-PREUVE : le commentaire de `MeeshyColors.textSecondary` cite bien la formule réelle

    func test_docCommentedLiteral_stillMatchesTheRealSourceFile() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("packages/MeeshySDK/Sources/MeeshyUI/Theme/MeeshyColors.swift")

        let source = AppSourceGuard.stripComments(try String(contentsOf: root, encoding: .utf8))

        XCTAssertTrue(
            source.contains("isDark ? indigo300 : indigo700.opacity(0.8)"),
            "MeeshyColors.swift ne contient plus `indigo300 : indigo700.opacity(0.8)` pour " +
            "textSecondary(isDark:) — la correction #5625 documentée/testée ici a dérivé du code réel"
        )
        XCTAssertFalse(
            source.contains("indigo300 : indigo700.opacity(0.6)"),
            "MeeshyColors.swift a réintroduit la formule d'origine (indigo700.opacity(0.6)) — " +
            "régression du défaut de contraste corrigé par #5625"
        )
    }

}
