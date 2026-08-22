import XCTest
@testable import MeeshyUI

/// S2 (exigence produit 2026-08-22, « reels ET vidéos de post ») — DoD S2
/// rejet, constat majeur #4 : `_InlineOverlayControls` (la chrome de TOUT
/// style `.inline` — bulles, galerie, cartes de post) n'avait aucun cas
/// `.mute` dans sa top bar, contrairement à `VideoTransportControls` (plein
/// écran). Un appelant `.inline` ajoutant `.mute` à son `ControlSet`
/// n'obtenait donc silencieusement AUCUN bouton — exactement le défaut
/// "contrôle demandé, chrome absente" que ce fichier verrouille.
///
/// `_InlineOverlayControls`'s body n'est pas introspectable sans
/// ViewInspector (pas une dépendance du projet) — pattern établi du dépôt
/// pour verrouiller un câblage SwiftUI : un source-guard sur l'expression
/// exacte (cf. `ImageFullscreenAutoLoadWiringTests`).
@MainActor
final class MeeshyVideoPlayerInlineMuteButtonTests: XCTestCase {

    private func sdkSource(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Media/
            .deletingLastPathComponent()   // MeeshyUITests/
            .deletingLastPathComponent()   // Tests/
            .deletingLastPathComponent()   // MeeshySDK/
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_inlineTopBar_mountsAMuteButton_gatedOnTheMuteControl() throws {
        let source = try sdkSource("Sources/MeeshyUI/Media/MeeshyVideoPlayer+Controls.swift")
        XCTAssertTrue(
            source.contains("if controls.contains(.mute) {"),
            "_InlineOverlayControls doit monter un bouton mute quand .mute est demandé — sans ce cas, le drapeau ControlSet est un no-op silencieux pour tout appelant .inline."
        )
    }

    func test_inlineMuteButton_reusesTheSameToggleAsFullscreen() throws {
        let source = try sdkSource("Sources/MeeshyUI/Media/MeeshyVideoPlayer+Controls.swift")
        XCTAssertTrue(
            source.contains("manager.isMuted.toggle()"),
            "Le bouton mute inline doit piloter EXACTEMENT le même état que le plein écran/la galerie (SharedAVPlayerManager.isMuted) — jamais un état second."
        )
        XCTAssertTrue(
            source.contains("manager.isMuted ? \"speaker.slash.fill\" : \"speaker.wave.2.fill\""),
            "Icône dupliquée à la main plutôt que réutilisée — un seul jeu d'icônes mute dans le produit."
        )
    }

    func test_inlineMuteButton_reusesExistingLocalizationKeys_noNewKeysNeeded() throws {
        let source = try sdkSource("Sources/MeeshyUI/Media/MeeshyVideoPlayer+Controls.swift")
        XCTAssertTrue(source.contains("\"media.video.mute\""), "Doit réutiliser la clé existante (déjà localisée en 7 langues via VideoTransportControls) plutôt qu'une clé neuve.")
        XCTAssertTrue(source.contains("\"media.video.unmute\""), "Doit réutiliser la clé existante (déjà localisée en 7 langues via VideoTransportControls) plutôt qu'une clé neuve.")
    }
}
