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
/// **AMENDEMENT lot 2 (2026-08-22).** Le constat « le rang plat se lit
/// directement sur le fond ambiant » ci-dessous reste vrai du NOM, de
/// l'effectif et de tout ce qui vit hors de la bulle — mais plus de l'HEURE :
/// le lot 2 la déplace DANS une bulle d'aperçu teintée à l'accent de la
/// conversation (`LentillePreviewBubble`). Une surface neuve sous du texte
/// mesuré ne peut pas rester non mesurée : c'est
/// `test_previewBubble_keepsTheTimestampAboveAA_onEveryGeneratedAccent`
/// ci-dessous, exhaustif sur TOUT l'espace d'accents que
/// `DynamicColorGenerator` sait produire, qui la mesure — et qui a DICTÉ les
/// opacités de remplissage retenues (`list.previewBubble.fillOpacity*`),
/// plutôt que l'inverse.
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

    // MARK: - Bulle d'aperçu (lot 2) — l'heure change de fond, donc de mesure

    /// Cotes lues dans le DOMICILE DE VÉRITÉ (`packages/shared/design/lentille-tokens.json`),
    /// jamais dans la constante Swift : ce test mesure ce que le DESIGN
    /// promet ; `LentilleMetricsTests` vérifie séparément que le miroir Swift
    /// porte la même valeur. Faire les deux ici confondrait « le token est
    /// mauvais » et « le miroir a dérivé ».
    private func previewBubbleToken(_ path: String...) throws -> Double {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("packages/shared/design/lentille-tokens.json")
        let data = try Data(contentsOf: url)
        var node: Any? = try XCTUnwrap(
            (try JSONSerialization.jsonObject(with: data) as? [String: Any])?["list"] as? [String: Any]
        )
        for key in ["previewBubble"] + path {
            node = (node as? [String: Any])?[key]
        }
        return try XCTUnwrap(
            (node as? NSNumber)?.doubleValue,
            "chemin absent dans lentille-tokens.json : list.previewBubble.\(path.joined(separator: "."))"
        )
    }

    /// TOUT l'espace d'accents que la conversation peut porter :
    /// `conversation.accentColor` est `colorPalette.primary`, c'est-à-dire
    /// `DynamicColorGenerator.colorFor(context:).primary` — un mélange
    /// pondéré (langue × type × thème). Les trois axes sont `CaseIterable` :
    /// l'espace est donc ÉNUMÉRABLE en entier (10 × 5 × 10), pas
    /// échantillonné. S'y ajoute le repli `colorForName` (palette de 40
    /// couleurs, atteinte par hachage) : 240 noms suffisent à la couvrir
    /// plusieurs fois.
    private var everyGeneratableAccentHex: [String] {
        var hexes: [String] = []
        for language in ConversationContext.ConversationLanguage.allCases {
            for type in ConversationContext.ConversationType.allCases {
                for theme in ConversationContext.ConversationTheme.allCases {
                    let context = ConversationContext(name: "c", type: type, language: language, theme: theme)
                    hexes.append(DynamicColorGenerator.colorFor(context: context).primary)
                }
            }
        }
        hexes.append(contentsOf: (0..<240).map { DynamicColorGenerator.colorForName("user-\($0)") })
        return hexes
    }

    /// Surface RÉELLE sous l'heure : l'accent translucide composé sur le fond
    /// ambiant — exactement ce que `LentillePreviewBubble` peint.
    private func bubbleSurface(accentHex: String, isDark: Bool, fillOpacity: Double) -> Color {
        WCAGContrast.composite(
            Color(hex: accentHex).opacity(fillOpacity),
            over: MeeshyColors.backgroundSecondary(isDark: isDark)
        )
    }

    /// **Le budget de contraste EST la loi qui borne les opacités de la
    /// bulle.** `textMuted` ne dispose que de ~5 % de marge de luminance sur
    /// le fond clair (4,76:1 contre un seuil de 4,5:1, mesuré ci-dessus) :
    /// toute teinte assombrissante mange cette marge. Ce témoin mesure
    /// l'heure sur la bulle pour CHAQUE accent générable, dans les deux
    /// thèmes — un remplissage remonté d'un cran le fera rougir, et c'est
    /// exactement le service attendu (le lot 2 a choisi ses opacités EN
    /// LISANT cette mesure, jamais à l'œil).
    func test_previewBubble_keepsTheTimestampAboveAA_onEveryGeneratedAccent() throws {
        let fillLight = try previewBubbleToken("fillOpacityLight")
        let fillDark = try previewBubbleToken("fillOpacityDark")
        let accents = everyGeneratableAccentHex
        XCTAssertGreaterThan(accents.count, 500, "l'espace d'accents doit être ÉNUMÉRÉ, jamais échantillonné (leçon 257)")

        for (isDark, fill) in [(false, fillLight), (true, fillDark)] {
            var worst = (ratio: Double.greatestFiniteMagnitude, hex: "")
            let muted = MeeshyColors.textMuted(isDark: isDark)
            for hex in accents {
                let surface = bubbleSurface(accentHex: hex, isDark: isDark, fillOpacity: fill)
                let ratio = WCAGContrast.ratioOfTranslucentForeground(muted, on: surface)
                if ratio < worst.ratio { worst = (ratio, hex) }
            }
            XCTAssertGreaterThanOrEqual(
                worst.ratio, aa,
                "heure Lentille sur la bulle d'aperçu, thème \(isDark ? "SOMBRE" : "CLAIR") : " +
                "l'accent #\(worst.hex) descend à \(WCAGContrast.fmt(worst.ratio)):1, sous AA " +
                "(\(aa):1). Remède : BAISSER list.previewBubble.fillOpacity\(isDark ? "Dark" : "Light") " +
                "dans lentille-tokens.json — jamais relâcher ce test, et jamais compenser en " +
                "éclaircissant textMuted (ce serait défaire D-18)."
            )
        }
    }

    /// Témoin de DISCRIMINATION (leçon 266) : sans lui, le témoin ci-dessus
    /// resterait vert même si la mesure ne mesurait rien (par ex. si
    /// `bubbleSurface` renvoyait le fond ambiant nu). Un remplissage
    /// nettement plus opaque DOIT faire tomber la mesure sous AA.
    func test_previewBubble_aMuchStrongerFillWouldBreakAA_soTheMeasureDiscriminates() {
        let muted = MeeshyColors.textMuted(isDark: false)
        let surface = bubbleSurface(accentHex: "6D28D9", isDark: false, fillOpacity: 0.25)
        let ratio = WCAGContrast.ratioOfTranslucentForeground(muted, on: surface)
        XCTAssertLessThan(
            ratio, aa,
            "un remplissage à 25 % de l'accent le plus sombre mesure \(WCAGContrast.fmt(ratio)):1 — " +
            "s'il passait AA, c'est que la mesure ne regarde pas la bulle."
        )
    }
}
