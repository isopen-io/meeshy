import XCTest
import SwiftUI
import UIKit
import MeeshyUI
@testable import Meeshy

// MARK: - StoryExportShareSheetPaletteTests
//
// `StoryExportShareSheet` a DEUX points d'entrée : « Mes stories » (thème de
// l'app) et le rail d'actions de `StoryViewerView`, dont le contenu porte
// `.preferredColorScheme(.dark)` — une `.sheet` présentée depuis cette
// hiérarchie en hérite. Ses surfaces étaient pourtant écrites en dur avec les
// valeurs de mode CLAIR (`indigo50.opacity(0.6)` / `indigo200`), donc le
// sélecteur de langue rendait un texte `.primary` (blanc en sombre) sur une
// lavande très claire.
//
// Ces tests mesurent le contraste RÉEL (WCAG 2.1, formule officielle) après
// composition alpha, plutôt que de comparer des `Color` entre eux : c'est la
// grandeur que le défaut viole, et la seule qui ne puisse pas être verte par
// accident.
//
// `@MainActor` : le target `Meeshy` a `SWIFT_DEFAULT_ACTOR_ISOLATION =
// MainActor` (SE-0466), donc `StoryExportSheetPalette` y est main-actor-isolé.
// Même patron que `MyStoryRowSaveRingTests`.
@MainActor
final class StoryExportShareSheetPaletteTests: XCTestCase {

    /// Seuil WCAG 2.1 AA pour du texte de taille normale.
    private var aaThreshold: Double { WCAGContrast.aaThreshold }

    /// Fond système d'une feuille en mode sombre (`systemBackground`, dark) —
    /// le substrat sur lequel le voile puis le sélecteur sont composés.
    private var darkSheetBase: Color { WCAGContrast.darkSheetBase }

    /// Idem en mode clair.
    private var lightSheetBase: Color { WCAGContrast.lightSheetBase }

    // MARK: - Le défaut

    /// La valeur d'origine, rendue en sombre : blanc sur lavande claire.
    /// Reproduite explicitement ici pour que la divergence avant/après soit
    /// prouvée DANS le test, sans dépendre de l'historique git.
    func test_previousFill_renderedInDarkMode_failedContrastForPrimaryText() {
        let previousFill = composite(MeeshyColors.indigo50.opacity(0.6), over: darkSheetBase)
        let ratio = contrastRatio(.white, previousFill)

        XCTAssertLessThan(
            ratio, aaThreshold,
            "Référence du défaut : l'ancien fond clair, rendu en mode sombre, donnait \(fmt(ratio)):1 " +
            "pour un texte .primary blanc — sous le seuil AA de \(aaThreshold):1."
        )
    }

    // MARK: - Le correctif

    func test_pickerFill_inDarkMode_carriesPrimaryTextAtAAContrast() {
        let fill = composite(StoryExportSheetPalette.pickerFill(isDark: true), over: darkVeiledBase)
        let ratio = contrastRatio(.white, fill)

        XCTAssertGreaterThanOrEqual(
            ratio, aaThreshold,
            "Le texte de la langue sélectionnée est `.primary` (blanc en sombre) : le fond du " +
            "sélecteur doit lui laisser au moins \(aaThreshold):1. Obtenu : \(fmt(ratio)):1."
        )
    }

    /// Le chevron `chevron.up.chevron.down` est `.secondary`, soit du blanc à
    /// ~60 % en mode sombre — le cas le plus exigeant de la vue, et celui qui
    /// tombait le plus bas (~1,9:1) avec l'ancien fond.
    func test_pickerFill_inDarkMode_carriesSecondaryGlyphAtAAContrast() {
        let fill = composite(StoryExportSheetPalette.pickerFill(isDark: true), over: darkVeiledBase)
        let secondary = composite(Color.white.opacity(0.6), over: fill)
        let ratio = contrastRatio(secondary, fill)

        XCTAssertGreaterThanOrEqual(
            ratio, aaThreshold,
            "Le chevron `.secondary` doit rester lisible sur le fond du sélecteur. " +
            "Obtenu : \(fmt(ratio)):1."
        )
    }

    func test_pickerFill_inLightMode_carriesPrimaryTextAtAAContrast() {
        let fill = composite(StoryExportSheetPalette.pickerFill(isDark: false), over: lightVeiledBase)
        let ratio = contrastRatio(.black, fill)

        XCTAssertGreaterThanOrEqual(ratio, aaThreshold, "Obtenu : \(fmt(ratio)):1.")
    }

    // MARK: - Parité du mode clair

    /// L'itération répare le mode sombre ; elle ne re-règle PAS le mode clair.
    /// Les trois jetons doivent y rendre exactement ce qu'ils rendaient avant.
    func test_lightModeTokens_areUnchangedFromTheOriginalValues() {
        assertSameRendering(
            StoryExportSheetPalette.wash(isDark: false),
            MeeshyColors.indigo950.opacity(0.04),
            "voile de fond"
        )
        assertSameRendering(
            StoryExportSheetPalette.pickerFill(isDark: false),
            MeeshyColors.indigo50.opacity(0.6),
            "fond du sélecteur"
        )
        assertSameRendering(
            StoryExportSheetPalette.pickerStroke(isDark: false),
            MeeshyColors.indigo200,
            "bordure du sélecteur"
        )
    }

    /// Le vrai marqueur du défaut : les trois jetons rendaient la MÊME valeur
    /// dans les deux modes. Aucun ne doit plus le faire.
    func test_everyToken_actuallyDivergesBetweenModes() {
        // Type annoté explicitement : un littéral de tableau de tuples dont les
        // membres sont des appels de fonction met le vérificateur de types
        // Swift à rude épreuve pour rien.
        let tokens: [(name: String, light: Color, dark: Color)] = [
            (name: "voile de fond",
             light: StoryExportSheetPalette.wash(isDark: false),
             dark: StoryExportSheetPalette.wash(isDark: true)),
            (name: "fond du sélecteur",
             light: StoryExportSheetPalette.pickerFill(isDark: false),
             dark: StoryExportSheetPalette.pickerFill(isDark: true)),
            (name: "bordure du sélecteur",
             light: StoryExportSheetPalette.pickerStroke(isDark: false),
             dark: StoryExportSheetPalette.pickerStroke(isDark: true))
        ]

        for (name, light, dark) in tokens {
            XCTAssertFalse(
                rendersIdentically(light, dark),
                "Le \(name) doit dépendre du colorScheme — c'est précisément ce qui manquait."
            )
        }
    }

    /// Le voile de fond en sombre doit éclaircir, pas assombrir : l'ancienne
    /// valeur peignait `indigo950` (presque noir) sur un fond déjà noir, donc
    /// ne produisait rien.
    func test_wash_inDarkMode_lightensRatherThanVanishing() {
        let veiled = composite(StoryExportSheetPalette.wash(isDark: true), over: darkSheetBase)

        XCTAssertGreaterThan(
            luminance(veiled), luminance(darkSheetBase),
            "Un voile posé sur le noir doit éclaircir pour être perceptible."
        )
    }

    // MARK: - Un seul pont vers UIActivityViewController

    /// `ShareSheet` (`ConversationMediaViews.swift`) est le pont unique. La vue
    /// portait sa propre copie (`ActivityView`), `MediaSaveFlowHost` la sienne
    /// (`MediaShareSheet`) : trois wrappers pour un seul comportement.
    ///
    /// Les deux fichiers convergés ici sont vérifiés **positivement**, et le
    /// balayage du reste de l'arbre est désormais une **égalité**.
    ///
    /// Il fut une inclusion tant que deux sites restaient dus :
    /// `TrackingLinkDetailView` (convergé sur `ShareLink` depuis) et
    /// `StoryViewerView+Content.shareStory()` (code mort supprimé en 217i).
    /// Les deux ayant disparu, l'inclusion n'attrapait plus que l'apparition
    /// d'un nouveau pont ; l'égalité attrape en plus la disparition du pont
    /// légitime — c'est-à-dire une convergence défaite sans mise à jour de ce
    /// garde-fou.
    func test_shareSheetIsTheSoleBridgeToUIActivityViewController() throws {
        for converged in ["Features/Main/Views/StoryExportShareSheet.swift",
                          "Features/Main/Components/MediaSaveFlowHost.swift"] {
            let code = strippingComments(
                try String(contentsOf: appRoot.appendingPathComponent(converged), encoding: .utf8)
            )
            XCTAssertFalse(
                code.contains("UIActivityViewController("),
                "\(converged) doit passer par ShareSheet, pas construire son propre pont UIKit."
            )
        }

        let expectedBridges: Set<String> = [
            "ConversationMediaViews.swift"   // définit ShareSheet — LE pont légitime
        ]

        var offenders: Set<String> = []
        let root = appRoot
        let walker = try XCTUnwrap(FileManager.default.enumerator(atPath: root.path))

        for case let relativePath as String in walker where relativePath.hasSuffix(".swift") {
            let code = strippingComments(
                try String(contentsOf: root.appendingPathComponent(relativePath), encoding: .utf8)
            )
            if code.contains("UIActivityViewController(") {
                offenders.insert((relativePath as NSString).lastPathComponent)
            }
        }

        XCTAssertEqual(
            offenders, expectedBridges,
            "Le jeu des ponts UIKit vers UIActivityViewController a changé. En trop : " +
            "\(offenders.subtracting(expectedBridges).sorted()) — utiliser ShareSheet dans une " +
            ".sheet plutôt que d'en dupliquer un. Manquant : " +
            "\(expectedBridges.subtracting(offenders).sorted())."
        )
    }

    /// La compatibilité des 11 sites d'appel existants tient à ce que
    /// `onCompletion` reste optionnel ET défaillant à `nil`.
    func test_shareSheetCompletionHandlerStaysOptionalAndDefaulted() throws {
        let source = try String(
            contentsOf: appRoot.appendingPathComponent("Features/Main/Views/ConversationMediaViews.swift"),
            encoding: .utf8
        )

        XCTAssertTrue(
            strippingComments(source).contains("var onCompletion: ((Bool) -> Void)? = nil"),
            "Sans valeur par défaut, les appels `ShareSheet(activityItems:)` existants ne compilent plus."
        )
    }

    // MARK: - Outillage

    /// Voile de fond déjà composé, tel que le sélecteur le voit réellement.
    private var darkVeiledBase: Color {
        composite(StoryExportSheetPalette.wash(isDark: true), over: darkSheetBase)
    }

    private var lightVeiledBase: Color {
        composite(StoryExportSheetPalette.wash(isDark: false), over: lightSheetBase)
    }

    /// `apps/ios/Meeshy` — quatre niveaux au-dessus de ce fichier, puis la cible.
    private var appRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy")
    }

    private func strippingComments(_ source: String) -> String {
        source
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }

    // La mesure WCAG elle-même (composition alpha, linéarisation sRGB,
    // luminance relative, rapport de contraste) vit dans
    // `MeeshyTests/Helpers/WCAGContrast.swift` — 220i l'y a extraite quand une
    // deuxième suite de palette en a eu besoin. Ces membres restent comme
    // façade pour que les sites d'appel de cette suite lisent comme avant.

    private func rgba(_ color: Color) -> (r: Double, g: Double, b: Double, a: Double) {
        WCAGContrast.rgba(color)
    }

    private func composite(_ top: Color, over bottom: Color) -> Color {
        WCAGContrast.composite(top, over: bottom)
    }

    private func luminance(_ color: Color) -> Double {
        WCAGContrast.luminance(color)
    }

    private func contrastRatio(_ a: Color, _ b: Color) -> Double {
        WCAGContrast.ratio(a, b)
    }

    private func fmt(_ value: Double) -> String {
        WCAGContrast.fmt(value)
    }

    private func rendersIdentically(_ lhs: Color, _ rhs: Color) -> Bool {
        WCAGContrast.rendersIdentically(lhs, rhs)
    }

    private func assertSameRendering(
        _ produced: Color, _ expected: Color, _ label: String,
        file: StaticString = #filePath, line: UInt = #line
    ) {
        WCAGContrast.assertSameRendering(produced, expected, label, file: file, line: line)
    }
}
