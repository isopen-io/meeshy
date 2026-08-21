import XCTest
@testable import Meeshy

/// Test de PARITÉ — `RiverMetrics` contre son domicile de vérité,
/// `packages/shared/design/lentille-tokens.json` → `river` (R-131, workshop
/// §7/§7bis/§7ter). Même règle que `LentilleMetricsTests`/`FocalMetricsTests`,
/// recopiée mot pour mot : « ne jamais réparer le test en y recopiant la
/// valeur qui a dérivé — réparer le token. »
///
/// **Nommage** — comme les deux suites sœurs : aucun jeton de
/// `FINAL_PHASE_CLASS_PATTERN` (`apps/ios/meeshy.sh` `~:1591`), reste en
/// phase 1 du gate local.
final class RiverMetricsTests: XCTestCase {

    // MARK: - Chargement du domicile de vérité

    /// Ressource de bundle DÉJÀ câblée par M-045 (`project.yml`,
    /// `MeeshyTests` → `../../packages/shared/design`, `type: folder`) —
    /// `river` est une section du MÊME fichier que `list`/`thread`, aucune
    /// entrée `project.yml` supplémentaire n'est nécessaire.
    private static var riverTokens: [String: Any] {
        guard let url = Bundle(for: RiverMetricsTests.self).url(
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
            let river = root["river"] as? [String: Any]
        else {
            XCTFail("lentille-tokens.json présent mais illisible, ou section `river` absente.")
            return [:]
        }
        return river
    }

    /// Descend un chemin de clés dans `riverTokens` et lit un nombre.
    private func tokenNumber(_ path: String...) throws -> Double {
        var node: Any? = Self.riverTokens
        for key in path {
            node = (node as? [String: Any])?[key]
        }
        return try XCTUnwrap((node as? NSNumber)?.doubleValue, "chemin absent ou non-numérique : \(path.joined(separator: "."))")
    }

    /// Descend un chemin de clés et lit un POURCENTAGE textuel (`"44%"`),
    /// rendu en FRACTION (`0.44`) — même helper que
    /// `LentilleMetricsTests.tokenPercent` (`row.transformOriginX`), copié
    /// ici plutôt que partagé : ces deux suites n'ont pas de domicile commun.
    private func tokenPercent(_ path: String...) throws -> Double {
        var node: Any? = Self.riverTokens
        for key in path {
            node = (node as? [String: Any])?[key]
        }
        let raw = try XCTUnwrap(node as? String, "chemin absent ou non-textuel : \(path.joined(separator: "."))")
        let trimmed = try XCTUnwrap(raw.hasSuffix("%") ? String(raw.dropLast()) : nil, "pas un pourcentage : \(raw)")
        return try XCTUnwrap(Double(trimmed)) / 100
    }

    // MARK: - Trait de branche

    func test_line_width() throws {
        XCTAssertEqual(Double(RiverMetrics.Line.width), try tokenNumber("line", "width"))
    }

    // MARK: - Couloir

    func test_lane_widthReference() throws {
        XCTAssertEqual(Double(RiverMetrics.Lane.widthReference), try tokenNumber("lane", "widthReference"))
    }

    func test_lane_gutter() throws {
        XCTAssertEqual(Double(RiverMetrics.Lane.gutter), try tokenNumber("lane", "gutter"))
    }

    // MARK: - Bulle

    func test_bubble_detourRadius() throws {
        XCTAssertEqual(Double(RiverMetrics.Bubble.detourRadius), try tokenNumber("bubble", "detourRadius"))
    }

    func test_bubble_baseGap() throws {
        XCTAssertEqual(Double(RiverMetrics.Bubble.baseGap), try tokenNumber("bubble", "baseGap"))
    }

    /// §7ter A.5 (2026-08-17) — fraction, même convention que
    /// `LentilleMetrics.Row.transformOriginX` (JSON `"44%"` ⇒ Swift `0.44`).
    func test_bubble_identityNameMaxWidth() throws {
        XCTAssertEqual(
            Double(RiverMetrics.Bubble.identityNameMaxWidth),
            try tokenPercent("bubble", "identityNameMaxWidth"),
            accuracy: 0.0001
        )
    }

    /// §7ter A.6 (2026-08-17).
    func test_bubble_flatBorderWidth() throws {
        XCTAssertEqual(Double(RiverMetrics.Bubble.flatBorderWidth), try tokenNumber("bubble", "flatBorderWidth"))
    }

    // MARK: - Connecteur de réponse

    func test_connector_strokeWidth() throws {
        XCTAssertEqual(Double(RiverMetrics.Connector.strokeWidth), try tokenNumber("connector", "strokeWidth"))
    }

    func test_connector_minBow() throws {
        XCTAssertEqual(Double(RiverMetrics.Connector.minBow), try tokenNumber("connector", "minBow"))
    }

    func test_connector_bowRatio() throws {
        XCTAssertEqual(Double(RiverMetrics.Connector.bowRatio), try tokenNumber("connector", "bowRatio"))
    }

    /// La fonction dérivée, pas seulement les constantes brutes — miroir de
    /// `Math.max(34, Math.abs(tx - fx) * 0.5)` (maquette).
    func test_connector_bow_formula() {
        XCTAssertEqual(RiverMetrics.Connector.bow(laneDistancePoints: 0), 34)
        XCTAssertEqual(RiverMetrics.Connector.bow(laneDistancePoints: 10), 34, "sous le plancher minBow")
        XCTAssertEqual(RiverMetrics.Connector.bow(laneDistancePoints: 100), 50)
        XCTAssertEqual(RiverMetrics.Connector.bow(laneDistancePoints: -100), 50, "symétrique, |Δ|")
    }

    // MARK: - En-tête de couloir

    func test_laneHeader_height() throws {
        XCTAssertEqual(Double(RiverMetrics.LaneHeader.height), try tokenNumber("laneHeader", "height"))
    }

    // MARK: - Garde R15 — aucune constante de LOI dupliquée ici (source guard)

    /// `RiverMetrics.swift` ne doit JAMAIS porter les constantes de
    /// `RiverLaneResolver` (loi) en littéral : `7` (`maxLanes`), `3`
    /// (`minVoices`), `2` (`headerFadeRanks`) sont trop communs pour être
    /// grep-ables sans faux positifs, mais `1800000`/`30 * 60 * 1000`
    /// (`laneSilenceWindowMs`) ne le sont pas — ce témoin verrouille au moins
    /// celui-là contre une future duplication accidentelle.
    func test_sourceGuard_neverDuplicatesLawSilenceWindowLiteral() throws {
        let sourceURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Riviere/
            .deletingLastPathComponent() // Unit/
            .deletingLastPathComponent() // MeeshyTests/
            .deletingLastPathComponent() // apps/ios/
            .appendingPathComponent("Meeshy/Features/Main/Riviere/Core/RiverMetrics.swift")
        let source = try String(contentsOf: sourceURL, encoding: .utf8)
        let codeLines = source
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.hasPrefix("//") && !$0.hasPrefix("///") }
        XCTAssertFalse(
            codeLines.contains { $0.contains("1800000") || $0.contains("30 * 60 * 1000") },
            "RiverMetrics.swift ne doit jamais dupliquer laneSilenceWindowMs (garde R15) — cette constante de loi vit uniquement dans RiverLaneResolver"
        )
    }
    // MARK: - `river.row` (retour produit 2026-08-21)

    /// L'écart entre deux RANGS et les tirets de la couture de continuation —
    /// posés le jour où le retour produit a dit « les messages s'empilent bord
    /// à bord sans espace ». Même règle que les autres familles : on répare le
    /// token, jamais le test.
    /// Le retrait INTÉRIEUR de la bulle a son propre token : le confondre avec
    /// `baseGap` (écart de pile) laissait le texte coller au contour.
    func test_bubble_contentPadding_matchesTokens() throws {
        XCTAssertEqual(
            RiverMetrics.Bubble.contentPadding,
            try CGFloat(tokenNumber("bubble", "contentPadding"))
        )
        XCTAssertNotEqual(
            RiverMetrics.Bubble.contentPadding,
            RiverMetrics.Bubble.baseGap,
            "Deux cotes DISTINCTES : une marge n'est pas un écart de pile."
        )
    }

    func test_row_matchesTokens() throws {
        XCTAssertEqual(RiverMetrics.Row.gap, try CGFloat(tokenNumber("row", "gap")))
        XCTAssertEqual(
            RiverMetrics.Row.continuationDashLength,
            try CGFloat(tokenNumber("row", "continuationDashLength"))
        )
        XCTAssertEqual(
            RiverMetrics.Row.continuationDashGap,
            try CGFloat(tokenNumber("row", "continuationDashGap"))
        )
    }
}
