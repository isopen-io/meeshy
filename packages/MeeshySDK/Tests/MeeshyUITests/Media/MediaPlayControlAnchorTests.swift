import XCTest
@testable import MeeshyUI

/// **Le cadre du contrôle de lecture est celui du BOUTON, jamais du lecteur
/// entier** (#11339). L'aperçu d'appui long de l'app ne perce son masque qu'à
/// ce cadre : s'il couvrait le lecteur entier, la citation, le pied et ses
/// drapeaux de langue, la forme d'onde ou la surface de la vidéo deviendraient
/// touchables par-dessus le menu.
///
/// Les corps SwiftUI ne s'introspectent pas sans ViewInspector : le témoin
/// découpe la déclaration du bouton et y cherche l'ancre — dedans, et nulle
/// part ailleurs dans le fichier.
@MainActor
final class MediaPlayControlAnchorTests: XCTestCase {

    private func sdkSource(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Le corps de la propriété `declaration`, jusqu'à la déclaration suivante.
    private func body(of declaration: String, in source: String) throws -> Substring {
        let start = try XCTUnwrap(source.range(of: declaration), "\(declaration) introuvable")
        let rest = source[start.upperBound...]
        let end = rest.range(of: "\n    private ")?.lowerBound
            ?? rest.range(of: "\n    var ")?.lowerBound
            ?? rest.endIndex
        return rest[..<end]
    }

    private func occurrences(of needle: String, in source: String) -> Int {
        source.components(separatedBy: needle).count - 1
    }

    func test_audioPlayer_anchorsItsPlayButton_only() throws {
        let source = try sdkSource("Sources/MeeshyUI/Media/AudioPlayerView.swift")
        let button = try body(of: "private var playButton: some View {", in: source)

        XCTAssertTrue(button.contains(".mediaPlayControlAnchor(attachmentId: attachment.id)"))
        XCTAssertEqual(occurrences(of: ".mediaPlayControlAnchor(", in: source), 1,
                       "Une seule ancre : le bouton, jamais `mainPlayer` ni ses emplacements.")
    }

    func test_inlineVideo_anchorsItsPlayButton_only() throws {
        let source = try sdkSource("Sources/MeeshyUI/Media/MeeshyVideoPlayer+InlineRenderer.swift")
        let button = try body(of: "private var playButton: some View {", in: source)

        XCTAssertTrue(button.contains(".mediaPlayControlAnchor(attachmentId: player.attachment.id)"))
        XCTAssertEqual(occurrences(of: ".mediaPlayControlAnchor(", in: source), 1,
                       "La surface de la vidéo et sa vignette ne sont pas des contrôles de lecture.")
    }

    func test_inlineVideoOverlay_anchorsItsPlayPauseButton_only() throws {
        let source = try sdkSource("Sources/MeeshyUI/Media/MeeshyVideoPlayer+Controls.swift")
        let button = try body(of: "private var playPauseButton: some View {", in: source)

        XCTAssertTrue(button.contains(".mediaPlayControlAnchor(attachmentId: attachmentId)"))
        XCTAssertEqual(occurrences(of: ".mediaPlayControlAnchor(", in: source), 1,
                       "Ni les sauts ±10 s, ni le son, ni la barre de lecture.")
    }
}
