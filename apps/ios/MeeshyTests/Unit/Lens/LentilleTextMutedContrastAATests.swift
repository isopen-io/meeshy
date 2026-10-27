import XCTest
import SwiftUI
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// D-18 (`tasks/lentille-cloture-phase1.md`, soldée le 2026-08-18) — le
/// point médian « · » et l'heure de la rangée Lentille (`LentilleConversationRow
/// .headerLine`, `.timestampColor` toujours égal à
/// `MeeshyColors.textMuted(isDark:)` — voir sa doc, « diverge délibérément
/// … le rang plat ne bascule plus JAMAIS sur le rouge ») sont peints par
/// `MeeshyColors.textMuted(isDark:)`. Aucun témoin de RATIO n'existait avant
/// ce fichier (seulement des gardes de source, cf. `LentilleRowSourceGuardTests`).
///
/// **AMENDEMENT ANNULÉ le 2026-08-23.** Le lot 2 (2026-08-22) avait déplacé
/// l'heure DANS une bulle d'aperçu teintée à l'accent, et cette suite mesurait
/// alors le contraste sur cette surface neuve
/// (`test_previewBubble_keepsTheTimestampAboveAA_onEveryGeneratedAccent`, qui
/// avait DICTÉ les opacités de remplissage). La directive produit du
/// 2026-08-23 (« les derniers messages ne doivent pas être dans des bulles »)
/// retire la bulle : ces deux témoins et leur lecteur de token partent AVEC
/// la surface qu'ils mesuraient — les laisser aurait été un vert par omission,
/// une mesure de fond que plus rien ne peint. La mesure JUSTE redevient
/// `test_lentilleRow_middotAndTimestamp_meetAA_onTheRealRowBackground`
/// ci-dessous : l'heure se relit directement sur le fond ambiant.
///
/// **Fonds réels re-prouvés (pas déduits).**
/// `LentilleConversationRow` ne porte AUCUNE carte (« AUCUNE carte (ni
/// `backgroundSecondary`, ni gradient de chaleur, ni bordure — la focus card
/// de LWS-8 est la seule carte de l'écran) », en-tête du fichier) : le rang
/// PLAT se lit directement sur le fond ambiant de l'écran,
/// `ThemeManager.backgroundGradient` (`RootView.themedBackground`), dont le
/// point le plus sombre en clair (`#F8F7FF`) est EXACTEMENT
/// `MeeshyColors.backgroundSecondary(isDark: false)` — même valeur, donc même
/// mesure. Quand le rang PORTE la focus card (élu, LWS-8), c'est
/// `LentilleFocusCard` qui peint `MeeshyColors.backgroundSecondary(isDark:)`
/// EN OVERLAY, à la MÊME position (`LentilleFocusCard.swift`, `.fill
/// (MeeshyColors.backgroundSecondary(isDark: isDark))`) — donc les deux
/// fonds réels sous l'heure convergent vers la MÊME paire de couleurs :
/// `backgroundSecondary(isDark:)`. Les tests ci-dessous mesurent en plus
/// `backgroundTertiary`/`backgroundPrimary` (`ThemeManager.swift`) et les
/// trois arrêts du dégradé ambiant, pour couvrir TOUS les fonds clairs
/// déclarés du design system — `textMuted` est consommé comme texte par 480+
/// sites `apps/ios`/`MeeshySDK` (grep `foregroundColor(theme.textMuted`/
/// `foregroundColor(textMuted`), tous posés sur ces mêmes tokens de thème,
/// jamais un hex ad hoc.
///
/// **Mesure AVANT correction (D-18, cette suite) — les DEUX thèmes étaient
/// rouges**, pas seulement le clair consigné par le finding initial du
/// soldage D-2 (méthode : composition alpha PUIS luminance relative WCAG,
/// même loi que `apps/web/__tests__/a11y/lentille-added-surfaces-contrast-aa.test.ts`,
/// reproduite ici par `WCAGContrast.ratioOfTranslucentForeground`) :
/// - clair, `indigo500.opacity(0.4)` sur `#F8F7FF` : **1,673:1**
/// - sombre, `indigo400.opacity(0.5)` sur `#13111C` : **2,456:1**
///
/// `test_beforeFix_oldFormulas_wereBelowAA_documented` verrouille ces deux
/// constats comme garde-fou historique — RE-JOUÉ ici, littéralement rouge
/// avant D-18 (les deux `XCTAssertLessThan` en seraient la preuve : la
/// mission a rejoué ce calcul avec l'ANCIENNE formule et confirmé < 4,5:1
/// avant d'écrire le correctif).
///
/// **Mutation qui fait rougir ce fichier** : n'importe quel retour de
/// `MeeshyColors.textMuted(isDark:)` vers une opacité/teinte plus faible
/// (ex. ré-introduire `indigo500.opacity(0.4)`/`indigo400.opacity(0.5)`, ou
/// n'importe quelle valeur intermédiaire encore sous 4,5:1) fait tomber
/// `test_lightTheme_meetsAA_onEveryDeclaredLightSurface`/
/// `test_darkTheme_meetsAA_onEveryDeclaredDarkSurface` — ces deux tests
/// appellent `MeeshyColors.textMuted(isDark:)` DIRECTEMENT (jamais un
/// littéral recopié), donc toute dérive de la fonction source se répercute
/// automatiquement, sans synchronisation manuelle à faire. La garde de
/// source `test_docCommentedLiterals_stillMatchTheRealSourceFile` protège en
/// plus contre une dérive de la valeur SANS dérive du commentaire qui la
/// documente (le commentaire citerait alors des ratios qui ne correspondent
/// plus à rien de réellement peint).
@MainActor
final class LentilleTextMutedContrastAATests: XCTestCase {

    private var aa: Double { WCAGContrast.aaThreshold }

    // MARK: - Fonds clairs déclarés (`ThemeManager`/`MeeshyColors`, RE-PREUVE en tête de fichier)

    private var lightSurfaces: [(name: String, color: Color)] {
        [
            ("backgroundSecondary #F8F7FF (rang+focus card, D-18)", MeeshyColors.backgroundSecondary(isDark: false)),
            ("backgroundPrimary #FFFFFF", Color(hex: "FFFFFF")),
            ("backgroundTertiary #EEF2FF", Color(hex: "EEF2FF")),
            ("backgroundGradient stop1 #FFFFFF", Color(hex: "FFFFFF")),
            ("backgroundGradient stop2 #FAFAFF", Color(hex: "FAFAFF")),
            ("backgroundGradient stop3 #F8F7FF", Color(hex: "F8F7FF")),
            ("inputBackground #F5F3FF", Color(hex: "F5F3FF")),
        ]
    }

    private var darkSurfaces: [(name: String, color: Color)] {
        [
            ("backgroundSecondary #13111C (rang+focus card, D-18)", MeeshyColors.backgroundSecondary(isDark: true)),
            ("backgroundPrimary #09090B", Color(hex: "09090B")),
            ("backgroundTertiary #1E1B4B", Color(hex: "1E1B4B")),
            ("backgroundGradient stop2 #0F0D19", Color(hex: "0F0D19")),
            ("inputBackground #16142A", Color(hex: "16142A")),
        ]
    }

    // MARK: - Conformité (calculée depuis la source, jamais un littéral figé)

    func test_lightTheme_meetsAA_onEveryDeclaredLightSurface() {
        let muted = MeeshyColors.textMuted(isDark: false)
        for surface in lightSurfaces {
            let ratio = WCAGContrast.ratioOfTranslucentForeground(muted, on: surface.color)
            XCTAssertGreaterThanOrEqual(
                ratio, aa,
                "MeeshyColors.textMuted(isDark: false) sur \(surface.name) : " +
                "\(WCAGContrast.fmt(ratio)):1 — sous le seuil AA \(aa):1"
            )
        }
    }

    func test_darkTheme_meetsAA_onEveryDeclaredDarkSurface() {
        let muted = MeeshyColors.textMuted(isDark: true)
        for surface in darkSurfaces {
            let ratio = WCAGContrast.ratioOfTranslucentForeground(muted, on: surface.color)
            XCTAssertGreaterThanOrEqual(
                ratio, aa,
                "MeeshyColors.textMuted(isDark: true) sur \(surface.name) : " +
                "\(WCAGContrast.fmt(ratio)):1 — sous le seuil AA \(aa):1"
            )
        }
    }

    /// Re-mesure EXACTE du point médian/heure sur les deux fonds réels que
    /// `LentilleConversationRow`/`LentilleFocusCard` peignent RÉELLEMENT
    /// (voir en-tête de fichier) — 4,76:1 clair / 5,13:1 sombre attendus.
    func test_lentilleRow_middotAndTimestamp_meetAA_onTheRealRowBackground() {
        let lightRatio = WCAGContrast.ratioOfTranslucentForeground(
            MeeshyColors.textMuted(isDark: false), on: MeeshyColors.backgroundSecondary(isDark: false)
        )
        XCTAssertGreaterThanOrEqual(lightRatio, aa, "heure Lentille CLAIRE : \(WCAGContrast.fmt(lightRatio)):1")
        XCTAssertEqual(lightRatio, 4.76, accuracy: 0.02, "mesure attendue re-prouvée (D-18) : ≈4,76:1")

        let darkRatio = WCAGContrast.ratioOfTranslucentForeground(
            MeeshyColors.textMuted(isDark: true), on: MeeshyColors.backgroundSecondary(isDark: true)
        )
        XCTAssertGreaterThanOrEqual(darkRatio, aa, "heure Lentille SOMBRE : \(WCAGContrast.fmt(darkRatio)):1")
        XCTAssertEqual(darkRatio, 5.13, accuracy: 0.02, "mesure attendue re-prouvée (D-18) : ≈5,13:1")
    }

    // MARK: - RED : les formules D'AVANT D-18 étaient rouges (garde-fou historique)

    func test_beforeFix_oldFormulas_wereBelowAA_documented() {
        let oldLight = WCAGContrast.ratioOfTranslucentForeground(
            MeeshyColors.indigo500.opacity(0.4), on: MeeshyColors.backgroundSecondary(isDark: false)
        )
        XCTAssertLessThan(
            oldLight, aa,
            "régression du garde-fou : indigo500.opacity(0.4) sur #F8F7FF mesure \(WCAGContrast.fmt(oldLight)):1 — " +
            "attendu < 4,5:1 (c'est le défaut D-18 d'origine, ~1,673:1)"
        )
        XCTAssertEqual(oldLight, 1.673, accuracy: 0.01)

        let oldDark = WCAGContrast.ratioOfTranslucentForeground(
            MeeshyColors.indigo400.opacity(0.5), on: MeeshyColors.backgroundSecondary(isDark: true)
        )
        XCTAssertLessThan(
            oldDark, aa,
            "régression du garde-fou : indigo400.opacity(0.5) sur #13111C mesure \(WCAGContrast.fmt(oldDark)):1 — " +
            "attendu < 4,5:1 (déficit sombre découvert par la mesure D-18, jamais consigné avant)"
        )
        XCTAssertEqual(oldDark, 2.456, accuracy: 0.01)
    }

    // MARK: - RE-PREUVE : le commentaire de `MeeshyColors.textMuted` cite bien les valeurs réellement peintes

    /// Si `MeeshyColors.textMuted(isDark:)` change de formule sans que ce
    /// fichier soit mis à jour, les tests ci-dessus continueraient de
    /// mesurer la RÉALITÉ (ils appellent la fonction, jamais un littéral) —
    /// mais le commentaire de tête de `MeeshyColors.swift` mentirait
    /// silencieusement sur la construction réelle. Cette garde lie le texte
    /// documenté aux deux littéraux qu'il prétend décrire.
    func test_docCommentedLiterals_stillMatchTheRealSourceFile() throws {
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
            source.contains("isDark ? indigo300.opacity(0.7) : indigo700.opacity(0.8)"),
            "MeeshyColors.swift ne contient plus `indigo300.opacity(0.7) : indigo700.opacity(0.8)` pour " +
            "textMuted(isDark:) — les valeurs D-18 documentées/testées ici ont dérivé du code réel, à réaligner"
        )
        XCTAssertFalse(
            source.contains("indigo400.opacity(0.5) : indigo500.opacity(0.4)"),
            "MeeshyColors.swift a réintroduit la formule D-18 d'origine (indigo500.opacity(0.4)/" +
            "indigo400.opacity(0.5)) — régression du défaut de contraste corrigé par D-18"
        )
    }

}
