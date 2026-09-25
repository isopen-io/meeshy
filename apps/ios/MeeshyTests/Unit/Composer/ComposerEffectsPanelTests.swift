import XCTest
import MeeshySDK
@testable import Meeshy

/// **Les effets du message s'ouvrent en petit panneau, comme la durée
/// éphémère** (#7967, directive porteur 2026-09-25).
@MainActor
final class ComposerEffectsPanelTests: XCTestCase {

    func test_lePanneau_nArmeAucuneProtection() {
        let protections: MessageEffectFlags = [.ephemeral, .blurred, .viewOnce]
        XCTAssertTrue(
            EffectsPickerView.panelFlags.intersection(protections).isEmpty,
            "éphémère, flou et vue unique vivent à la barre d'outils — « Tout effacer » ne doit pas les retirer"
        )
    }

    func test_lePanneau_porteLesDixEffetsDApparitionEtPermanents() {
        let attendus: MessageEffectFlags = [.shake, .zoom, .explode, .confetti, .fireworks, .waoo,
                                            .glow, .pulse, .rainbow, .sparkle]
        XCTAssertEqual(EffectsPickerView.panelFlags, attendus)
    }

    func test_laBaguette_ouvreLePanneauDansLeComposeur_jamaisUneFeuille() throws {
        let protections = try Self.source("Meeshy/Features/Main/Components/UniversalComposerBar+Protections.swift")
        XCTAssertTrue(protections.contains("showEffectsPanel.toggle()"), "la baguette bascule le panneau inline")
        XCTAssertFalse(protections.contains("onRequestEffectsPicker"), "plus aucun rappel vers une feuille de l'hôte")

        let layout = try Self.source("Meeshy/Features/Main/Components/UniversalComposerBar+Layout.swift")
        XCTAssertTrue(layout.contains("if showEffectsPanel {"), "le panneau est monté dans le verre du composeur")

        let hôte = try Self.source("Meeshy/Features/Main/Views/ConversationView+Composer.swift")
        XCTAssertFalse(hôte.contains("EffectsPickerView("), "la conversation ne présente plus de feuille des effets")
    }

    func test_lesRails_gardentUneMargeAvecLeBordDuVerre() throws {
        let layout = try Self.source("Meeshy/Features/Main/Components/UniversalComposerBar+Layout.swift")
        let marges = layout.components(separatedBy: ".padding(.top, Self.railTopInset)").count - 1
        XCTAssertEqual(marges, 3, "durée éphémère, effets et effets permanents s'écartent du bord haut du verre")
    }

    private static func source(_ relative: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return try String(contentsOf: root.appendingPathComponent(relative), encoding: .utf8)
    }
}
