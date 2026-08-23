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
        XCTAssertTrue(
            body.contains(".accessibilityValue(\"\\(value)\")"),
            "StatRing must announce the raw (un-abbreviated) count as its accessibility value."
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
        guard let range = source.range(of: "ArcGauge(") else {
            XCTFail("ConversationDashboardView.swift must render the health ArcGauge"); return
        }
        let vicinity = String(source[range.lowerBound...].prefix(1400))
        XCTAssertTrue(
            vicinity.contains(".accessibilityElement(children: .ignore)"),
            "The health gauge and its \"Sante\" caption must form one VoiceOver element; " +
            "otherwise VoiceOver reads a naked \"78\" from inside the arc with no label."
        )
        XCTAssertTrue(
            vicinity.contains(".accessibilityValue(\"\\(health)\")"),
            "The health gauge must announce the score as its accessibility value."
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
