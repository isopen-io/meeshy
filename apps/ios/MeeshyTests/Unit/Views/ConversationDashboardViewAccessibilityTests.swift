import XCTest

/// Source-level VoiceOver guard for the conversation dashboard's data-viz
/// gauges (`StatRing`, health `ArcGauge`) in ConversationDashboardView.swift.
/// Both render a bare number inside decorative geometry with the caption as a
/// separate sibling, so before grouping VoiceOver announced the abbreviated
/// value ("1,2k") and the uppercased caption ("MESSAGES") as two disjoint,
/// context-free stops per gauge — and the health score as a naked "78".
final class ConversationDashboardViewAccessibilityTests: XCTestCase {

    private func dashboardSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Components/ConversationDashboardView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Découpe le corps d'une `private struct` NOMMÉE, borné à la déclaration
    /// SUIVANTE plutôt qu'à un nombre de caractères.
    ///
    /// La borne était un `prefix(2600)`, et ce nombre magique a fini par coûter
    /// un rouge : le 2026-08-23, une modification de `StatRing` a déplacé
    /// `.accessibilityValue("\(value)")` de l'offset 2411 à 2595 ; le motif
    /// faisant 30 caractères, sa FIN est passée hors fenêtre et `contains` a
    /// rendu `false`. **La garde a rougi sur du code qui la satisfaisait
    /// toujours** — le pire mode d'échec possible pour une garde, puisqu'il
    /// envoie corriger ce qui n'est pas cassé. La marge résiduelle sur `main`
    /// était de **5 caractères** : n'importe quelle édition de `StatRing`
    /// l'aurait déclenché.
    ///
    /// Une borne sémantique n'a pas de marge à épuiser. Elle ne peut pas non
    /// plus produire de faux vert : elle s'arrête AVANT la struct suivante,
    /// donc un modificateur porté par `ArcGauge` ne peut pas satisfaire une
    /// assertion sur `StatRing` (`test_statRingBody_isBoundedToItsOwnStruct`).
    private func structBody(named name: String, in source: String) -> String? {
        guard let start = source.range(of: "private struct \(name)") else { return nil }
        let end = source[start.upperBound...].range(of: "\nprivate struct ")?.lowerBound
            ?? source.endIndex
        return String(source[start.lowerBound..<end])
    }

    /// Le corps d'une **fonction** privée, borné à la déclaration suivante —
    /// jumeau de `structBody(named:in:)` (238i) pour les vues qui se rendent
    /// depuis un `private func` plutôt que depuis une struct.
    ///
    /// **241i — pourquoi il remplace un `prefix(1400)`.** La jauge de santé était
    /// découpée par un nombre de CARACTÈRES à partir de `ArcGauge(`. 238i a déjà
    /// documenté ce que produit une telle borne : un doc-comment pousse la FIN du
    /// motif hors fenêtre et la garde rougit **sur du code qui la satisfait
    /// toujours** — pire qu'un faux vert, puisqu'elle envoie corriger ce qui n'est
    /// pas cassé. La marge résiduelle était tombée à **138 caractères** en 241i
    /// (le motif s'allonge en nommant sa source). Une borne sémantique n'a pas de
    /// marge à épuiser.
    private func functionBody(named name: String, in source: String) -> String? {
        guard let start = source.range(of: "private func \(name)") else { return nil }
        let rest = source[start.upperBound...]
        let end = rest.range(of: "\n    private func ")?.lowerBound
            ?? rest.range(of: "\n    private var ")?.lowerBound
            ?? source.endIndex
        return String(source[start.lowerBound..<end])
    }

    func test_statRing_isSingleVoiceOverElement_withLabelAndValue() throws {
        let source = try dashboardSource()
        guard let body = structBody(named: "StatRing", in: source) else {
            XCTFail("ConversationDashboardView.swift must define the StatRing gauge"); return
        }
        XCTAssertTrue(
            body.contains(".accessibilityElement(children: .ignore)"),
            "StatRing must collapse its value + caption into one VoiceOver element; " +
            "otherwise the abbreviated value and the uppercased caption are read as two stops."
        )
        XCTAssertTrue(
            body.contains(".accessibilityLabel(label)"),
            "StatRing must expose the already-localized, non-uppercased label to VoiceOver."
        )
        // 241i — cette assertion épinglait l'ORTHOGRAPHE `"\(value)"`, qui gravait
        // les chiffres latins. La règle, elle, n'a jamais été « interpole » : elle
        // est « annonce le compte BRUT, non abrégé ». `LocalizedNumber.exact` la
        // sert mieux (entier, groupé, dans les chiffres du lecteur).
        //
        // Elle est donc réécrite pour épingler l'INTENTION plutôt qu'une graphie :
        // ce qui doit rester vrai, c'est que la valeur ne soit pas l'abrégé
        // (`displayValue`, « 1,2 k »). Un test qui pin une graphie rougit à chaque
        // refactor légitime ; un test qui pin l'intention ne rougit que sur une
        // vraie régression.
        XCTAssertTrue(
            body.contains(".accessibilityValue(LocalizedNumber.exact(value))"),
            "StatRing must announce the raw (un-abbreviated) count as its accessibility "
            + "value, through the single locale-aware source (`LocalizedNumber.exact`)."
        )
        XCTAssertFalse(
            body.contains(".accessibilityValue(displayValue)"),
            "StatRing must NOT announce the abbreviated form: « 1,2 k » stands for 1 200 "
            + "as well as 1 249, and a screen reader has no width constraint to justify it."
        )
    }

    /// La garde se garde elle-même : si la borne cessait de borner, le corps
    /// avalerait `ArcGauge` — qui porte lui aussi
    /// `.accessibilityElement(children: .ignore)` — et le test ci-dessus
    /// passerait au vert pour la mauvaise struct.
    func test_statRingBody_isBoundedToItsOwnStruct() throws {
        let source = try dashboardSource()
        let body = try XCTUnwrap(structBody(named: "StatRing", in: source))
        XCTAssertTrue(
            body.contains("private var displayValue"),
            "La borne s'arrête trop tôt : le corps de StatRing ne contient plus sa propre valeur affichée."
        )
        XCTAssertFalse(
            body.contains("private struct ArcGauge"),
            "La borne ne borne plus : le corps de StatRing déborde sur la struct suivante."
        )
    }

    func test_healthArcGauge_isSingleVoiceOverElement_withScoreValue() throws {
        let source = try dashboardSource()
        guard let vicinity = functionBody(named: "heroHealthCard", in: source) else {
            XCTFail("ConversationDashboardView.swift must render the health card"); return
        }
        XCTAssertTrue(
            vicinity.contains("ArcGauge("),
            "The health card must render its score through the ArcGauge."
        )
        XCTAssertTrue(
            vicinity.contains(".accessibilityElement(children: .ignore)"),
            "The health gauge and its \"Sante\" caption must form one VoiceOver element; " +
            "otherwise VoiceOver reads a naked \"78\" from inside the arc with no label."
        )
        // 241i — même rectification que pour `StatRing` ci-dessus : la règle est
        // « annonce le score », pas « interpole-le ». La graphie `"\(health)"`
        // gravait les chiffres latins.
        XCTAssertTrue(
            vicinity.contains(".accessibilityValue(LocalizedNumber.exact(health))"),
            "The health gauge must announce the score as its accessibility value, "
            + "through the single locale-aware source (`LocalizedNumber.exact`)."
        )
    }

    /// La garde se garde elle-même, dans les DEUX sens — exigence posée par 238i
    /// quand `structBody` a remplacé le premier `prefix(2600)` : élargir une
    /// borne oblige à prouver qu'on ne fabrique pas un faux vert.
    ///
    /// Vers le bas, la borne doit **contenir** la jauge de santé ; vers le haut,
    /// elle doit **s'arrêter avant** `StatRing`, qui porte le même
    /// `.accessibilityElement(children: .ignore)` et sa propre valeur. Si elle
    /// débordait, `test_healthArcGauge_…` passerait au vert pour le mauvais
    /// élément.
    func test_heroHealthCardBody_isBoundedToItsOwnFunction() throws {
        let source = try dashboardSource()
        let body = try XCTUnwrap(functionBody(named: "heroHealthCard", in: source))

        XCTAssertTrue(body.contains("ArcGauge("), "La borne doit contenir la jauge.")
        XCTAssertFalse(
            body.contains("struct StatRing"),
            "La borne déborde sur StatRing : la garde de la jauge pourrait passer "
            + "au vert pour un autre élément."
        )
        XCTAssertFalse(
            body.contains(".accessibilityValue(LocalizedNumber.exact(value))"),
            "La borne a avalé la valeur de StatRing — elle ne borne plus rien."
        )
    }

    func test_periodPicker_announcesSelectedStateAndLocalizedLabel() throws {
        let source = try dashboardSource()
        guard let range = source.range(of: "private var periodPicker") else {
            XCTFail("ConversationDashboardView.swift must define the periodPicker"); return
        }
        let body = String(source[range.lowerBound...].prefix(1400))
        XCTAssertTrue(
            body.contains(".accessibilityAddTraits(isSelected ? [.isSelected] : [])"),
            "Each period pill must announce its selected state to VoiceOver; " +
            "otherwise the active period is signalled only by color/weight (WCAG 1.4.1)."
        )
        XCTAssertTrue(
            body.contains(".accessibilityLabel(period.accessibilityLabel)"),
            "Each period pill must expose a descriptive localized label; " +
            "VoiceOver reading the compact \"7j\" pill glyph alone is cryptic."
        )
        XCTAssertFalse(
            body.contains("Text(period.rawValue)"),
            "The picker must render a localized label, never the raw enum token."
        )
    }

    func test_chartPeriod_labelsAreLocalized_notHardcodedFrench() throws {
        let source = try dashboardSource()
        guard let range = source.range(of: "enum ChartPeriod") else {
            XCTFail("ConversationDashboardView.swift must define ChartPeriod"); return
        }
        let body = String(source[range.lowerBound...].prefix(1400))
        XCTAssertFalse(
            body.contains("case all = \"Tout\""),
            "ChartPeriod must not display a hardcoded French raw value; " +
            "labels must resolve via String(localized:)."
        )
        for key in ["dashboard.period.week.short", "dashboard.period.all"] {
            XCTAssertTrue(
                body.contains(key),
                "ChartPeriod must resolve its labels through the \(key) localization key."
            )
        }
    }
}
