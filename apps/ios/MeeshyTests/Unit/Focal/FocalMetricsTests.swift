import XCTest
import SwiftUI
import MeeshyUI
@testable import Meeshy

/// Test de PARITÉ — `FocalMetrics` contre son domicile de vérité,
/// `packages/shared/design/lentille-tokens.json` → `thread` (tâche 0,
/// workshop §« TÂCHE 0 — FocalMetrics »). Patron recopié mot pour mot de
/// `LentilleMetricsTests` (`Lentille/Core/`, GELÉ, lecture seule — imité,
/// jamais édité) : même mécanique de folder reference pour localiser
/// `lentille-tokens.json` dans le bundle de tests (leçon 265 : le chemin de
/// bundle `design/lentille-tokens.json` est une ressource PARTAGÉE, déjà
/// câblée par `project.yml` — propriété M-045/LWS-5, ligne unique, PAS
/// re-câblée ici).
///
/// **Règle du test, recopiée du modèle `MeeshyTokenParityTest.kt`** :
/// « ne jamais réparer le test en y recopiant la valeur qui a dérivé —
/// réparer le token. » Si un témoin ci-dessous rougit, la cause est presque
/// toujours que `FocalMetrics` a dérivé du JSON committé. Le correctif
/// touche `FocalMetrics.swift` — jamais ce test, et jamais le JSON pour le
/// faire coller à une régression Swift.
///
/// **Nommage** — comme #3010 WS-0 : aucun jeton qui bascule cette suite en
/// phase 2 du gate (`meeshy.sh` `FINAL_PHASE_CLASS_PATTERN`). `FocalMetricsTests`,
/// pas `ConversationFocalMetricsTests`.
///
/// **Couverture** : CHAQUE valeur numérique de `thread.*` a un témoin ici —
/// y compris les zones hors périmètre WS-3/WS-4 (`focusCard`, `hiddenChrome`,
/// `pill.top`) mirrorées par `FocalMetrics` pour la parité EXHAUSTIVE exigée
/// par la tâche 0, même si leurs consommateurs arrivent avec WS-5/WS-6.
@MainActor
final class FocalMetricsTests: XCTestCase {

    // MARK: - Chargement du domicile de vérité

    /// Ressource de bundle : `packages/shared/design/lentille-tokens.json`,
    /// déjà câblée en ressource de bundle de test (`project.yml`, propriété
    /// LWS-5/M-045 — pas re-câblée par cette tâche).
    private static var threadTokens: [String: Any] {
        guard let url = Bundle(for: FocalMetricsTests.self).url(
            forResource: "lentille-tokens",
            withExtension: "json",
            subdirectory: "design"
        ) else {
            XCTFail("""
                lentille-tokens.json introuvable dans le bundle de tests sous `design/`. \
                Vérifier la ressource `../../packages/shared/design` (type: folder) dans \
                project.yml, puis `xcodegen generate`.
                """)
            return [:]
        }
        guard
            let data = try? Data(contentsOf: url),
            let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let thread = root["thread"] as? [String: Any]
        else {
            XCTFail("lentille-tokens.json présent mais illisible, ou section `thread` absente.")
            return [:]
        }
        return thread
    }

    /// Descend un chemin de clés dans `threadTokens` et lit un nombre.
    /// Échec de lecture (chemin absent, mauvais type) ⇒ `nil`, pas `0` — un
    /// témoin comparé à `nil` avec `XCTUnwrap` rougit distinctement d'un
    /// témoin comparé à une vraie divergence de valeur.
    private func tokenNumber(_ path: String...) throws -> Double {
        var node: Any? = Self.threadTokens
        for key in path {
            node = (node as? [String: Any])?[key]
        }
        return try XCTUnwrap((node as? NSNumber)?.doubleValue, "chemin absent ou non-numérique : \(path.joined(separator: "."))")
    }

    /// `Font.Weight` n'expose aucune valeur numérique publique : ce mapping
    /// EST la traduction CSS → SwiftUI documentée par le contrat Focal §0
    /// (échelle SwiftUI 100…900), recopiée du même mapping dans
    /// `LentilleMetricsTests`. Il vit dans le test — la logique de
    /// correspondance, pas une valeur susceptible de dériver.
    private func expectedWeight(forCSS css: Double) -> Font.Weight {
        switch css {
        case 100: return .ultraLight
        case 200: return .thin
        case 300: return .light
        case 400: return .regular
        case 500: return .medium
        case 600: return .semibold
        case 700: return .bold
        case 800: return .heavy
        case 900: return .black
        default: return .regular
        }
    }

    // MARK: - Rang

    func test_row_padding() throws {
        XCTAssertEqual(Double(FocalMetrics.Row.paddingVertical), try tokenNumber("row", "padding", "vertical"))
        XCTAssertEqual(Double(FocalMetrics.Row.paddingHorizontal), try tokenNumber("row", "padding", "horizontal"))
    }

    // MARK: - Avatar

    func test_avatar_size() throws {
        XCTAssertEqual(Double(FocalMetrics.Avatar.size), try tokenNumber("avatar", "size"))
    }

    // MARK: - Nom · Heure

    /// §0 (contrat Focal) : taille du nom = `MeeshyFont.subheadSize`, pas un
    /// littéral `13` — re-prouve que la constante SDK porte bien la valeur
    /// du token.
    func test_name_size_isMeeshyFontSubheadSize() throws {
        XCTAssertEqual(FocalMetrics.Name.size, MeeshyFont.subheadSize)
        XCTAssertEqual(Double(FocalMetrics.Name.size), try tokenNumber("name", "size"))
    }

    func test_name_weight() throws {
        let css = try tokenNumber("name", "weight")
        XCTAssertEqual(FocalMetrics.Name.weight, expectedWeight(forCSS: css))
        XCTAssertEqual(FocalMetrics.Name.weight, .heavy, "§0 : 800 CSS → .heavy (Font.Weight.extrabold n'existe pas)")
    }

    func test_time() throws {
        XCTAssertEqual(Double(FocalMetrics.Time.size), try tokenNumber("time", "size"))
        let css = try tokenNumber("time", "weight")
        XCTAssertEqual(FocalMetrics.Time.weight, expectedWeight(forCSS: css))
        XCTAssertEqual(FocalMetrics.Time.weight, .semibold, "600 CSS → .semibold")
    }

    // MARK: - Texte du message

    /// §0 (contrat Focal) : taille du texte = `MeeshyFont.bodySize`, pas un
    /// littéral `15`.
    func test_text_size_isMeeshyFontBodySize() throws {
        XCTAssertEqual(FocalMetrics.Text.size, MeeshyFont.bodySize)
        XCTAssertEqual(Double(FocalMetrics.Text.size), try tokenNumber("line2", "size"))
    }

    func test_text_lineHeightRatio() throws {
        XCTAssertEqual(Double(FocalMetrics.Text.lineHeightRatio), try tokenNumber("line2", "lineHeight"))
    }

    func test_text_indent() throws {
        XCTAssertEqual(Double(FocalMetrics.Text.indent), try tokenNumber("line2", "indentPx"))
    }

    /// Formule additive documentée par `FocalMetrics.Text.lineSpacing(forResolvedFontSize:)` :
    /// `s * (ratio - 1)`, arrondi au demi-point. Sanity sur le ratio réel du
    /// token (`1.42`), pas une redérivation du token lui-même.
    func test_text_lineSpacing_formula() {
        // s = 15 (taille de base) : 15 * 0.42 = 6.3 → arrondi au demi-point = 6.5
        XCTAssertEqual(FocalMetrics.Text.lineSpacing(forResolvedFontSize: 15), 6.5, accuracy: 0.0001)
        // s = 16 (grossissement à l'arrêt du scroll, écart #3) : 16 * 0.42 = 6.72 → 6.5
        XCTAssertEqual(FocalMetrics.Text.lineSpacing(forResolvedFontSize: 16), 6.5, accuracy: 0.0001)
        // s = 0 : aucun interligne additif.
        XCTAssertEqual(FocalMetrics.Text.lineSpacing(forResolvedFontSize: 0), 0, accuracy: 0.0001)
    }

    // MARK: - Carte de focus

    func test_focusCard_ringAndRadius() throws {
        XCTAssertEqual(Double(FocalMetrics.FocusCard.ringSize), try tokenNumber("focusCard", "ringSize"))
        XCTAssertEqual(Double(FocalMetrics.FocusCard.radius), try tokenNumber("focusCard", "radius"))
    }

    func test_focusCard_margin() throws {
        XCTAssertEqual(Double(FocalMetrics.FocusCard.marginHorizontal), try tokenNumber("focusCard", "margin", "horizontal"))
        XCTAssertEqual(Double(FocalMetrics.FocusCard.marginVertical), try tokenNumber("focusCard", "margin", "vertical"))
    }

    func test_focusCard_padding() throws {
        XCTAssertEqual(Double(FocalMetrics.FocusCard.paddingHorizontal), try tokenNumber("focusCard", "padding", "horizontal"))
        XCTAssertEqual(Double(FocalMetrics.FocusCard.paddingVertical), try tokenNumber("focusCard", "padding", "vertical"))
    }

    // MARK: - Citation

    func test_quote_railWidth() throws {
        XCTAssertEqual(Double(FocalMetrics.Quote.railWidth), try tokenNumber("quote", "borderSize"))
    }

    // MARK: - Médias

    func test_media_radius() throws {
        XCTAssertEqual(Double(FocalMetrics.Media.radius), try tokenNumber("media", "radius"))
    }

    // MARK: - Chrome masqué au défilement

    func test_hiddenChrome() throws {
        XCTAssertEqual(Double(FocalMetrics.HiddenChrome.translateY), try tokenNumber("hiddenChrome", "translateY"))
        XCTAssertEqual(FocalMetrics.HiddenChrome.opacityEnd, try tokenNumber("hiddenChrome", "opacityEnd"))
        XCTAssertEqual(FocalMetrics.HiddenChrome.easeOut, try tokenNumber("hiddenChrome", "easeOut"))
    }

    // MARK: - Pilule de défilement

    func test_pill_top_and_fade() throws {
        XCTAssertEqual(Double(FocalMetrics.Pill.top), try tokenNumber("pill", "top"))
        XCTAssertEqual(FocalMetrics.Pill.fadeDurationMs, try tokenNumber("pill", "fadeDurationMs"))
    }

    func test_pill_fadeDuration_isSecondsFromMs() {
        XCTAssertEqual(FocalMetrics.Pill.fadeDuration, FocalMetrics.Pill.fadeDurationMs / 1000, accuracy: 0.0001)
        XCTAssertEqual(FocalMetrics.Pill.fadeDuration, 0.28, accuracy: 0.0001)
    }

    /// Garde R15 (comme `LentilleMetricsTests.test_pill_dismissAfterMs_isNeverMirroredAsALiteral_sourceGuard`) :
    /// `900` (le `dismissAfterMs` du JSON) ne doit JAMAIS apparaître en
    /// littéral dans `FocalMetrics.swift` — la constante appartient à la loi
    /// partagée (`Focal/Core/ScrollTimePillLaw.lingerMs`, GELÉ), pas au
    /// fichier de tokens de design.
    func test_pill_dismissAfterMs_isNeverMirroredAsALiteral_sourceGuard() throws {
        XCTAssertEqual(try tokenNumber("pill", "dismissAfterMs"), 900, "le JSON documente toujours la loi à 900 ms")

        // Ce fichier vit sous apps/ios/MeeshyTests/Unit/Focal/ ; la source
        // sous apps/ios/Meeshy/Features/Main/Focal/Core/ — 4 remontées
        // jusqu'à apps/ios/, puis redescente vers la source.
        let sourceURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Focal/
            .deletingLastPathComponent() // Unit/
            .deletingLastPathComponent() // MeeshyTests/
            .deletingLastPathComponent() // apps/ios/
            .appendingPathComponent("Meeshy/Features/Main/Focal/Core/FocalMetrics.swift")
        let source = try String(contentsOf: sourceURL, encoding: .utf8)
        let codeLines = AppSourceGuard.strippedLines(source)
            .map { $0.trimmingCharacters(in: .whitespaces) }
        XCTAssertFalse(
            codeLines.contains { $0.contains("900") },
            "FocalMetrics.swift ne doit contenir aucun littéral `900` hors commentaire (garde R15) — la valeur vient de la loi partagée, référencée en commentaire uniquement"
        )
    }

    // MARK: - Agent ✦ / rangée pont

    func test_agent_row() throws {
        XCTAssertEqual(Double(FocalMetrics.Agent.borderWidth), try tokenNumber("agent", "row", "borderSize"))
        XCTAssertEqual(Double(FocalMetrics.Agent.radius), try tokenNumber("agent", "row", "radius"))
    }
}
