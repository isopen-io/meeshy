import XCTest
import MeeshySDK
@testable import MeeshyUI

/// #9890 — l'aperçu d'une citation du composeur passe par le plein écran du
/// lecteur commun, SANS les sorties que ce plein écran offre à un message :
/// l'ancien lecteur nu n'en offrait aucune, et le remplacer ne doit pas en
/// ouvrir (enregistrer et partager sortent le média de la conversation).
final class MeeshyVideoPlayerPreviewControlsTests: XCTestCase {

    func test_fullscreenPreview_offersNoExit() {
        let preview = MeeshyVideoPlayer.ControlSet.fullscreenPreview
        XCTAssertFalse(preview.contains(.save))
        XCTAssertFalse(preview.contains(.share))
    }

    func test_fullscreenPreview_dropsTheMessageChrome() {
        let preview = MeeshyVideoPlayer.ControlSet.fullscreenPreview
        XCTAssertFalse(preview.contains(.author), "la citation n'a pas d'auteur à nommer ici")
        XCTAssertFalse(preview.contains(.loop))
    }

    func test_fullscreenPreview_keepsWhatPlayingNeeds() {
        let preview = MeeshyVideoPlayer.ControlSet.fullscreenPreview
        for control: MeeshyVideoPlayer.ControlSet in [.playPause, .scrubber, .duration, .close, .mute, .speed] {
            XCTAssertTrue(preview.contains(control), "\(control.rawValue)")
        }
    }

    func test_fullscreenPreview_isStrictlyWithinTheFullscreenDefault() {
        XCTAssertTrue(MeeshyVideoPlayer.ControlSet.fullscreenDefault
            .isSuperset(of: .fullscreenPreview))
    }

    // MARK: - Une lecture qui ne se rapporte pas (#9890)

    @MainActor
    func test_reportsConsumption_isOnByDefault_andOpaque() {
        let piece = MeeshyMessageAttachment(id: "a1", mimeType: "video/mp4", fileSize: 1, fileUrl: "https://cdn.meeshy.me/v.mp4")
        XCTAssertTrue(MeeshyVideoPlayer(attachment: piece, style: .fullscreen, controls: .fullscreenPreview,
                                        accentColor: "#000000").reportsConsumption,
                      "chaque surface existante garde son suivi")
        XCTAssertFalse(MeeshyVideoPlayer(attachment: piece, style: .fullscreen, controls: .fullscreenPreview,
                                         accentColor: "#000000", reportsConsumption: false).reportsConsumption)
    }

    /// Garde de SOURCE : le rapport part d'un `POST` et d'une file hors-ligne,
    /// sans surface observable hors hébergement SwiftUI.
    func test_bothRenderers_loadWithoutIdentity_whenTheyDoNotReport() throws {
        let media = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().appendingPathComponent("Sources/MeeshyUI/Media")
        for file in ["MeeshyVideoPlayer+Renderers.swift", "MeeshyVideoPlayer+InlineRenderer.swift"] {
            let text = try String(contentsOf: media.appendingPathComponent(file), encoding: .utf8)
            XCTAssertTrue(text.contains("if player.reportsConsumption {"), file)
            XCTAssertTrue(text.contains("manager.load(urlString: player.attachment.fileUrl)\n"), file)
        }
        let fullscreen = try String(contentsOf: media.appendingPathComponent("MeeshyVideoPlayer+Renderers.swift"),
                                    encoding: .utf8)
        XCTAssertTrue(fullscreen.contains("guard player.reportsConsumption, let start = watchStartTime"),
                      "le rapport partiel à la fermeture se tait aussi")
    }
}
