import XCTest
import SwiftUI
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// C2 — le PLATEAU, le fond permanent du composer unifié.
///
/// Trois teintes, et une seule loi : **chacune est un jeton `MeeshyColors`**,
/// jamais un hex écrit ici. Un test qui recopierait `"#1E1B4B"` en dur passerait
/// au vert le jour où le design system bougerait la rampe — il mesurerait alors
/// une couleur que plus rien ne peint. Chaque assertion appelle donc le jeton
/// DIRECTEMENT, et toute dérive de la source se répercute sans synchronisation
/// manuelle (même loi que `LentilleTextMutedContrastAATests`, D-18).
///
/// Le second volet est le **contraste** : le socle est permanent (loi 5 de la
/// doctrine — « le socle ne bouge jamais »), donc ses libellés se lisent sur les
/// TROIS teintes, pas seulement sur la teinte par défaut. Un plateau qu'on peut
/// choisir est un plateau sur lequel il faut savoir lire.
@MainActor
final class ComposerPlateauTests: XCTestCase {

    // MARK: - Les trois teintes sont des jetons, pas des littéraux

    func test_plateauTint_noir_resolvesToTheSDKToken() {
        XCTAssertTrue(
            WCAGContrast.rendersIdentically(PlateauTint.noir.color, MeeshyColors.plateauNoir),
            "La teinte noire doit être le jeton `MeeshyColors.plateauNoir`, pas un `Color.black` local"
        )
    }

    func test_plateauTint_indigoProfond_resolvesToTheSDKToken() {
        XCTAssertTrue(
            WCAGContrast.rendersIdentically(PlateauTint.indigoProfond.color, MeeshyColors.indigo950),
            "L'indigo profond réutilise `indigo950`, le cran le plus sombre de la rampe de marque"
        )
    }

    func test_plateauTint_violetProfond_resolvesToTheSDKToken() {
        XCTAssertTrue(
            WCAGContrast.rendersIdentically(PlateauTint.violetProfond.color, MeeshyColors.violet950),
            "Le violet profond est le jeton `violet950` — même provenance Tailwind que la rampe indigo"
        )
    }

    /// O6 — la teinte est un réglage PERSISTÉ, et son défaut doit être stable :
    /// c'est le fond que voit quiconque ouvre le composer pour la première fois.
    func test_plateauTint_defaultsToIndigoProfond() {
        XCTAssertEqual(PlateauTint.defaultTint, .indigoProfond)
    }

    /// Un réglage persisté se relit depuis `@AppStorage`, donc depuis une
    /// chaîne. Une valeur inconnue (réglage écrit par une version future, ou
    /// stockage corrompu) ne doit pas laisser le composer sans fond.
    func test_plateauTint_unknownRawValue_fallsBackToTheDefault() {
        XCTAssertEqual(PlateauTint(rawValue: "turquoise") ?? .defaultTint, .indigoProfond)
    }

    func test_plateauTint_coversExactlyThreeTints() {
        XCTAssertEqual(PlateauTint.allCases.count, 3, "Trois teintes, ni plus ni moins (O6)")
    }

    // MARK: - Le socle se lit sur les TROIS teintes

    /// Le plateau est toujours sombre — ses libellés sont donc ceux du thème
    /// SOMBRE, quelle que soit l'apparence du système. Mesurer avec les jetons
    /// clairs donnerait un faux vert sur une surface que personne ne peint.
    ///
    /// **Cette liste est celle des jetons que le host peint RÉELLEMENT**, et
    /// `test_theMeasuredListCoversEveryForegroundTheHostActuallyPaints`
    /// ci-dessous l'y arrime. La première version de ce fichier mesurait aussi
    /// `textPrimary` et `textMuted`, que le socle n'utilise nulle part : la
    /// mesure portait sur des premiers plans que rien ne pose — le symétrique
    /// exact du défaut que D-18 avait corrigé dans l'autre sens (mesurer un
    /// FOND que plus rien ne peint).
    private let socleForegrounds: [(String, Color)] = [
        ("textSecondary(isDark: true)", MeeshyColors.textSecondary(isDark: true)),
    ]

    func test_socleForegrounds_meetAA_onEveryPlateauTint() {
        for tint in PlateauTint.allCases {
            for (name, foreground) in socleForegrounds {
                let ratio = WCAGContrast.ratioOfTranslucentForeground(foreground, on: tint.color)
                XCTAssertGreaterThanOrEqual(
                    ratio, 4.5,
                    "\(name) sur le plateau \(tint.rawValue) mesure \(WCAGContrast.fmt(ratio)):1 — sous AA texte normal"
                )
            }
        }
    }

    /// L'arrimage. Sans lui, la liste mesurée et la vue divergeraient dès qu'un
    /// jeton serait ajouté au socle : le test resterait vert en ne mesurant plus
    /// tout ce qui est peint. Cette garde échoue si le host référence un jeton
    /// de premier plan qui n'est pas mesuré ci-dessus.
    func test_theMeasuredListCoversEveryForegroundTheHostActuallyPaints() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Composer
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Composer/MeeshyComposerHost.swift")
        let code = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
        XCTAssertTrue(code.contains("struct MeeshyComposerHost"), "Source du host introuvable — la garde ne mesurerait rien")

        // Les seuls premiers plans autorisés : celui que cette suite mesure à
        // 4,5:1, et l'accent, mesuré séparément au seuil composant de 3:1.
        let measured = ["textSecondary(isDark: true)", "indigo400"]
        for line in code.split(separator: "\n") where line.contains("MeeshyColors.text") || line.contains("MeeshyColors.indigo") {
            XCTAssertTrue(
                measured.contains(where: { line.contains($0) }),
                "Le host peint un jeton non mesuré : « \(line.trimmingCharacters(in: .whitespaces)) » — ajoute-le à `socleForegrounds` ou à la mesure d'accent"
            )
        }
    }

    /// **Constat consigné, pas un test à contourner.** `textMuted(isDark: true)`
    /// (`indigo300.opacity(0.7)`) mesure **4,41:1** sur le violet profond — sous
    /// AA texte normal. Le socle ne l'utilise pas aujourd'hui, et ce témoin
    /// existe pour qu'on ne l'y mette pas sans le savoir : le jour où quelqu'un
    /// voudra du texte atténué dans le socle, il devra soit assombrir
    /// `violet950`, soit choisir un autre jeton. Si ce test se met à ÉCHOUER,
    /// c'est que la mesure est repassée au-dessus d'AA — bonne nouvelle : il
    /// devient alors superflu et `textMuted` peut rejoindre `socleForegrounds`.
    func test_textMuted_isBelowAA_onVioletProfond_documented() {
        let ratio = WCAGContrast.ratioOfTranslucentForeground(
            MeeshyColors.textMuted(isDark: true), on: PlateauTint.violetProfond.color
        )
        XCTAssertLessThan(
            ratio, 4.5,
            "`textMuted` passe désormais AA sur le violet (\(WCAGContrast.fmt(ratio)):1) — il peut rejoindre les jetons mesurés du socle"
        )
    }

    /// L'accent du socle (le bouton de publication) est une SURFACE, pas du
    /// texte : il relève du seuil AA « composant » de 3:1. Le mesurer à 4,5
    /// aurait forcé un accent délavé ; ne pas le mesurer du tout l'aurait laissé
    /// se fondre dans le plateau.
    func test_socleAccent_meetsComponentAA_onEveryPlateauTint() {
        for tint in PlateauTint.allCases {
            let ratio = WCAGContrast.ratioOfTranslucentForeground(MeeshyColors.indigo400, on: tint.color)
            XCTAssertGreaterThanOrEqual(
                ratio, 3.0,
                "L'accent du socle sur \(tint.rawValue) mesure \(WCAGContrast.fmt(ratio)):1 — sous AA composant"
            )
        }
    }
}
