import XCTest
import SwiftUI
import UIKit
import MeeshyUI
@testable import Meeshy

// MARK: - ReportMessageSheetPaletteTests
//
// `ReportMessageSheet` n'a qu'UN point de présentation : le rail d'actions de
// `StoryViewerView` (`StoryViewerView+Sidebar.swift:1063`). Le `body` du lecteur
// est `viewerContent`, qui porte `.preferredColorScheme(.dark)` — une `.sheet`
// présentée depuis cette hiérarchie en hérite. La feuille se rend donc en
// SOMBRE pour tout le monde, en permanence.
//
// Elle peignait pourtant tout son texte depuis `ThemeManager`, qui porte le
// thème *choisi dans l'app*. Un utilisateur en thème clair obtenait
// `textPrimary` = `indigo950` (presque noir) sur le fond système sombre de la
// feuille. Contrairement à `SharePickerView` — qui survit au même forçage parce
// qu'il pose son propre fond opaque `theme.backgroundPrimary` — cette feuille
// n'a AUCUN fond à elle : elle s'appuie sur le fond de feuille système, lequel
// suit le mode rendu. Les deux référentiels se croisaient donc directement.
//
// C'est un parcours de sûreté (signaler un contenu abusif). Ces tests mesurent
// le contraste RÉEL plutôt que de comparer des `Color`, via `WCAGContrast`.
//
// `@MainActor` : le target `Meeshy` a `SWIFT_DEFAULT_ACTOR_ISOLATION =
// MainActor` (SE-0466), donc `ReportSheetPalette` y est main-actor-isolé.
@MainActor
final class ReportMessageSheetPaletteTests: XCTestCase {

    private var aa: Double { WCAGContrast.aaThreshold }
    private var darkSheet: Color { WCAGContrast.darkSheetBase }

    // MARK: - Références du défaut
    //
    // Les valeurs fautives sont réécrites explicitement ici : la divergence
    // avant/après est ainsi prouvée DANS le test, sans dépendre de git.
    // `MeeshyColors.*(isDark: false)` est exactement ce que `ThemeManager`
    // rendait à un utilisateur en thème clair — `ThemeManager.textPrimary` est
    // littéralement `MeeshyColors.textPrimary(isDark: mode.isDark)`.

    func test_previousTitleColor_renderedInDarkMode_wasEffectivelyInvisible() {
        let ratio = WCAGContrast.ratio(MeeshyColors.textPrimary(isDark: false), darkSheet)

        XCTAssertLessThan(
            ratio, aa,
            "Référence du défaut : le titre du formulaire de signalement peint en jetons de " +
            "thème CLAIR, sur le fond de feuille SOMBRE imposé par le lecteur de stories, " +
            "donnait \(WCAGContrast.fmt(ratio)):1 — seuil AA \(aa):1."
        )
    }

    func test_previousDetailsLabelColor_renderedInDarkMode_failedContrast() {
        let ratio = WCAGContrast.ratioOfTranslucentForeground(
            MeeshyColors.textSecondary(isDark: false), on: darkSheet
        )

        XCTAssertLessThan(
            ratio, aa,
            "Référence du défaut : le libellé « Détails (facultatif) » donnait " +
            "\(WCAGContrast.fmt(ratio)):1."
        )
    }

    /// Le pire des trois : le champ de saisie ne fixe pas la couleur de son
    /// texte, donc celui-ci est `.primary` — BLANC sous le forçage sombre —
    /// tandis que son fond venait du thème clair (`#F5F3FF`, presque blanc).
    /// L'utilisateur ne voyait pas ce qu'il tapait.
    func test_previousInputBackground_renderedInDarkMode_hidThePrimaryTextTypedIntoIt() {
        let ratio = WCAGContrast.ratio(.white, ReportSheetPalette.inputBackground(isDark: false))

        XCTAssertLessThan(
            ratio, aa,
            "Référence du défaut : texte `.primary` blanc sur le fond de champ du thème clair " +
            "= \(WCAGContrast.fmt(ratio)):1 — la saisie était illisible."
        )
    }

    // MARK: - Le correctif

    func test_titleColor_inDarkMode_meetsAA() {
        let ratio = WCAGContrast.ratio(MeeshyColors.textPrimary(isDark: true), darkSheet)

        XCTAssertGreaterThanOrEqual(
            ratio, aa,
            "Le titre doit rester lisible sur le fond de feuille sombre. " +
            "Obtenu : \(WCAGContrast.fmt(ratio)):1."
        )
    }

    func test_detailsLabelColor_inDarkMode_meetsAA() {
        let ratio = WCAGContrast.ratioOfTranslucentForeground(
            MeeshyColors.textSecondary(isDark: true), on: darkSheet
        )

        XCTAssertGreaterThanOrEqual(
            ratio, aa,
            "Le libellé secondaire doit rester lisible. Obtenu : \(WCAGContrast.fmt(ratio)):1."
        )
    }

    func test_inputBackground_inDarkMode_carriesThePrimaryTextTypedIntoIt() {
        let ratio = WCAGContrast.ratio(.white, ReportSheetPalette.inputBackground(isDark: true))

        XCTAssertGreaterThanOrEqual(
            ratio, aa,
            "Le champ de saisie doit porter son texte `.primary`. " +
            "Obtenu : \(WCAGContrast.fmt(ratio)):1."
        )
    }

    /// Le mode clair n'est pas re-réglé par cette itération : quand la feuille
    /// est rendue en clair, elle doit rendre exactement ce qu'elle rendait.
    func test_lightMode_stillMeetsAA_andIsUnchanged() {
        WCAGContrast.assertSameRendering(
            ReportSheetPalette.inputBackground(isDark: false),
            Color(hex: "F5F3FF"),
            "fond de champ en mode clair (valeur reprise de ThemeManager.inputBackground)"
        )

        let ratio = WCAGContrast.ratio(
            MeeshyColors.textPrimary(isDark: false), WCAGContrast.lightSheetBase
        )
        XCTAssertGreaterThanOrEqual(ratio, aa, "Obtenu : \(WCAGContrast.fmt(ratio)):1.")
    }

    func test_inputBackground_divergesBetweenModes() {
        XCTAssertFalse(
            WCAGContrast.rendersIdentically(
                ReportSheetPalette.inputBackground(isDark: false),
                ReportSheetPalette.inputBackground(isDark: true)
            ),
            "Le fond de champ doit dépendre du mode — c'est précisément ce qui manquait."
        )
    }

    func test_inputBackground_inDarkMode_matchesTheThemeManagerValue() {
        WCAGContrast.assertSameRendering(
            ReportSheetPalette.inputBackground(isDark: true),
            Color(hex: "16142A"),
            "fond de champ en mode sombre (valeur reprise de ThemeManager.inputBackground)"
        )
    }

    // MARK: - La loi structurante

    /// Le cœur de l'itération, et la seule chose qui empêche la régression :
    /// la vue doit lire le colorScheme RENDU, jamais le thème CHOISI.
    ///
    /// `colorScheme` est le signal strictement meilleur : `MeeshyApp` pilote
    /// `.preferredColorScheme(theme.preferredColorScheme)` depuis la même
    /// préférence que `ThemeManager.mode`, donc les deux coïncident partout
    /// dans l'app — ils ne divergent que sous un override imbriqué, c'est-à-dire
    /// exactement dans le seul contexte où cette feuille est présentée.
    func test_theSheetResolvesItsSurfacesFromTheRenderedColorScheme() throws {
        let code = strippedSource("Features/Main/Components/ReportMessageSheet.swift")

        XCTAssertFalse(
            code.contains("ThemeManager"),
            "ReportMessageSheet ne doit pas lire ThemeManager : sous le `.preferredColorScheme(.dark)` " +
            "du lecteur de stories, il porte le thème CHOISI, pas le mode RENDU — et repeindrait " +
            "du texte de thème clair sur un fond sombre."
        )
        XCTAssertTrue(
            code.contains("@Environment(\\.colorScheme)"),
            "La vue doit résoudre ses surfaces depuis le colorScheme rendu."
        )
    }

    /// Le point de présentation qui rend le défaut permanent. Si la feuille
    /// cessait d'être présentée sous un forçage sombre, la démonstration
    /// ci-dessus changerait de nature — ce test l'ancre.
    func test_theSheetIsStillPresentedFromTheForcedDarkStoryHierarchy() throws {
        // #4084 — la feuille est présentée depuis le menu d'options, qui vit
        // dans l'en-tête ; celui-ci a quitté `+Sidebar` pour son propre fichier.
        XCTAssertTrue(
            strippedSource("Features/Main/Views/StoryViewerView+Header.swift")
                .contains("ReportMessageSheet("),
            "Point de présentation attendu : l'en-tête de StoryViewerView."
        )
        XCTAssertTrue(
            strippedSource("Features/Main/Views/StoryViewerView.swift")
                .contains(".preferredColorScheme(.dark)"),
            "C'est ce forçage qui fait hériter la feuille du mode sombre pour TOUS les utilisateurs."
        )
    }

    // MARK: - Outillage

    /// `apps/ios/Meeshy` — quatre niveaux au-dessus de ce fichier, puis la cible.
    private var appRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy")
    }

    private func strippedSource(_ relativePath: String) -> String {
        let raw = (try? String(contentsOf: appRoot.appendingPathComponent(relativePath), encoding: .utf8)) ?? ""
        return raw
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }
}
