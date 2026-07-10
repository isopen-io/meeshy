import XCTest
@testable import Meeshy

/// Source-analysis guards : les menus custom rendent le design système de la
/// version d'iOS courante via le layer `Compatibility/` du SDK.
///
/// Invariants (2026-07-10, audit exhaustif des menus) :
/// 1. Le gate Liquid Glass (`#available(iOS 26`) vit UNIQUEMENT dans
///    `Compatibility/` — partout ailleurs on compose `adaptiveGlass` /
///    `adaptiveGlassProminent` (qui gatent en interne) ou le flag logique
///    `Platform.isIOS26OrLater`.
/// 2. Le mini-menu d'appel (`CallBubbleView`, long-press sur la bulle) est en
///    Liquid Glass adaptatif — plus jamais de fond `Color.black` fixe qui ne
///    devient pas glass sur iOS 26 et force des icônes illisibles en light.
/// 3. Le panneau mort de `MessageOverlayMenu` (chrome `.ultraThinMaterial`
///    brut + voiles hardcodés) ne réapparaît pas.
@MainActor
final class MenuAdaptiveDesignGuardTests: XCTestCase {

    private var repoRoot: URL {
        // …/apps/ios/MeeshyTests/Unit/Views/ThisFile.swift → racine du repo
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    private func swiftFiles(under relativeRoot: String) -> [URL] {
        let root = repoRoot.appendingPathComponent(relativeRoot)
        guard let enumerator = FileManager.default.enumerator(
            at: root,
            includingPropertiesForKeys: nil
        ) else { return [] }
        return enumerator.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
    }

    /// Le gate iOS 26 est la propriété exclusive du layer Compatibility.
    func test_iOS26AvailabilityGates_liveOnlyInCompatibilityLayer() {
        let roots = ["apps/ios/Meeshy", "packages/MeeshySDK/Sources"]
        var violations: [String] = []

        for root in roots {
            for file in swiftFiles(under: root) {
                guard !file.path.contains("/Compatibility/") else { continue }
                guard let text = try? String(contentsOf: file, encoding: .utf8) else { continue }
                for (index, line) in text.components(separatedBy: "\n").enumerated() {
                    let trimmed = line.trimmingCharacters(in: .whitespaces)
                    guard !trimmed.hasPrefix("//") else { continue }
                    if trimmed.contains("available(iOS 26") {
                        violations.append("\(file.lastPathComponent):\(index + 1)  \(trimmed)")
                    }
                }
            }
        }

        XCTAssertTrue(
            violations.isEmpty,
            "Gate iOS 26 hors du layer Compatibility/ — utiliser adaptiveGlass/" +
            "adaptiveGlassProminent (gate interne) ou Platform.isIOS26OrLater :\n"
            + violations.joined(separator: "\n")
        )
    }

    /// Les boutons du mini-menu d'appel portent le Liquid Glass adaptatif.
    func test_callBubbleMiniMenu_buttonsUseAdaptiveGlass() throws {
        let url = repoRoot.appendingPathComponent("apps/ios/Meeshy/Features/Main/Views/CallBubbleView.swift")
        let source = try String(contentsOf: url, encoding: .utf8)

        XCTAssertTrue(
            source.contains(".adaptiveGlass("),
            "Les boutons mute/speaker du mini-menu doivent porter .adaptiveGlass (wrapper Compatibility)."
        )
        XCTAssertTrue(
            source.contains(".adaptiveGlassProminent(in: Circle(), tint: MeeshyColors.error)"),
            "Le bouton raccrocher (destructif) doit rester le glass proéminent teinté error."
        )

        guard let menuRange = source.range(of: "private var muteButton") else {
            XCTFail("CallBubbleView doit exposer le mini-menu (muteButton/speakerButton/hangupButton)")
            return
        }
        let menuBlock = String(source[menuRange.lowerBound...])
        XCTAssertFalse(
            menuBlock.contains("Color.black.opacity"),
            "Plus de fond Color.black fixe sur les boutons du mini-menu — il ne devient " +
            "jamais Liquid Glass sur iOS 26 et force des icônes illisibles en mode light."
        )
    }

    /// Le panneau mort non-glass de MessageOverlayMenu reste supprimé.
    func test_messageOverlayMenu_deadDetailPanelStaysRemoved() throws {
        let url = repoRoot.appendingPathComponent("apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift")
        let source = try String(contentsOf: url, encoding: .utf8)
        XCTAssertFalse(
            source.contains("func detailPanel(") || source.contains("var panelBackground"),
            "Le detail panel historique (chrome .ultraThinMaterial brut + voiles hardcodés, " +
            "jamais monté) a été supprimé — le réintroduire doit passer par adaptiveGlass."
        )
    }
}
