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
    private let aaThreshold: Double = 4.5

    /// Fond système d'une feuille en mode sombre (`systemBackground`, dark) —
    /// le substrat sur lequel le voile puis le sélecteur sont composés.
    private let darkSheetBase = Color(red: 28.0 / 255, green: 28.0 / 255, blue: 30.0 / 255)

    /// Idem en mode clair.
    private let lightSheetBase = Color.white

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
        for (name, light, dark) in [
            ("voile de fond",
             StoryExportSheetPalette.wash(isDark: false),
             StoryExportSheetPalette.wash(isDark: true)),
            ("fond du sélecteur",
             StoryExportSheetPalette.pickerFill(isDark: false),
             StoryExportSheetPalette.pickerFill(isDark: true)),
            ("bordure du sélecteur",
             StoryExportSheetPalette.pickerStroke(isDark: false),
             StoryExportSheetPalette.pickerStroke(isDark: true))
        ] {
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
    /// Les deux fichiers convergés ici sont vérifiés **positivement** ; le
    /// balayage du reste de l'arbre est une inclusion, pas une égalité, pour
    /// une raison précise : `TrackingLinkDetailView` est détenu par une PR en
    /// vol qui le converge, et `StoryViewerView+Content.shareStory()` est du
    /// code mort sans site d'appel dont la suppression est un nettoyage à part.
    /// Une égalité virerait au rouge le jour où l'un des deux disparaît —
    /// c'est-à-dire au moment même où la dette est payée. L'inclusion attrape
    /// ce qui compte : l'apparition d'un NOUVEAU pont dupliqué.
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

        let knownRemaining: Set<String> = [
            "ConversationMediaViews.swift",   // définit ShareSheet — le pont légitime
            "TrackingLinkDetailView.swift",   // convergence détenue par une PR en vol
            "StoryViewerView+Content.swift"   // shareStory() : code mort, 0 site d'appel
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

        XCTAssertTrue(
            offenders.isSubset(of: knownRemaining),
            "Nouveau pont UIKit vers UIActivityViewController : \(offenders.subtracting(knownRemaining).sorted()). " +
            "Utiliser ShareSheet dans une .sheet plutôt que d'en dupliquer un."
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

    private func rgba(_ color: Color) -> (r: Double, g: Double, b: Double, a: Double) {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        UIColor(color).getRed(&r, green: &g, blue: &b, alpha: &a)
        return (Double(r), Double(g), Double(b), Double(a))
    }

    /// Composition alpha « source over » — ce que fait réellement le compositeur
    /// quand un `fill` translucide est posé sur un fond opaque.
    private func composite(_ top: Color, over bottom: Color) -> Color {
        let t = rgba(top)
        let b = rgba(bottom)
        return Color(
            red: t.r * t.a + b.r * (1 - t.a),
            green: t.g * t.a + b.g * (1 - t.a),
            blue: t.b * t.a + b.b * (1 - t.a)
        )
    }

    /// Luminance relative WCAG 2.1.
    private func luminance(_ color: Color) -> Double {
        let c = rgba(color)
        func linear(_ channel: Double) -> Double {
            channel <= 0.03928 ? channel / 12.92 : pow((channel + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * linear(c.r) + 0.7152 * linear(c.g) + 0.0722 * linear(c.b)
    }

    private func contrastRatio(_ a: Color, _ b: Color) -> Double {
        let la = luminance(a)
        let lb = luminance(b)
        return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
    }

    private func fmt(_ value: Double) -> String {
        String(format: "%.2f", value)
    }

    /// Deux `Color` rendent-elles la même chose, à un pas de quantification
    /// 8 bits près ? Comparer les `Color` directement testerait l'égalité
    /// structurelle de SwiftUI, pas le pixel produit.
    private func rendersIdentically(_ lhs: Color, _ rhs: Color) -> Bool {
        let l = rgba(lhs)
        let r = rgba(rhs)
        let tolerance = 1.0 / 255
        return abs(l.r - r.r) < tolerance
            && abs(l.g - r.g) < tolerance
            && abs(l.b - r.b) < tolerance
            && abs(l.a - r.a) < tolerance
    }

    private func assertSameRendering(
        _ produced: Color, _ expected: Color, _ label: String,
        file: StaticString = #filePath, line: UInt = #line
    ) {
        let p = rgba(produced)
        let e = rgba(expected)
        let tolerance = 1.0 / 255
        XCTAssertEqual(p.r, e.r, accuracy: tolerance, "\(label) — rouge", file: file, line: line)
        XCTAssertEqual(p.g, e.g, accuracy: tolerance, "\(label) — vert", file: file, line: line)
        XCTAssertEqual(p.b, e.b, accuracy: tolerance, "\(label) — bleu", file: file, line: line)
        XCTAssertEqual(p.a, e.a, accuracy: tolerance, "\(label) — alpha", file: file, line: line)
    }
}
