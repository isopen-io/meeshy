import XCTest

/// **Le code média mort a quitté le dépôt, et l'aperçu plein écran de la
/// citation du composeur passe par le lecteur commun** (#9890, lot IL17).
///
/// Chaque assertion nomme une ligne du critère de fin : un fichier retiré ne
/// doit pas revenir par un `git merge` distrait, et un lecteur nu
/// (`AVPlayer(url:)` sans session audio, débit posé avant le montage) ne doit
/// pas renaître à côté de `MeeshyVideoPlayer(.fullscreen)`.
///
/// Garde de SOURCE : la propriété gardée (l'absence d'un type) n'a aucune
/// surface observable à l'exécution.
final class DeadMediaCodeRemovedGuardTests: XCTestCase {

    private var root: URL {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<6 { url.deleteLastPathComponent() }
        return url
    }

    private func exists(_ relativePath: String) -> Bool {
        FileManager.default.fileExists(atPath: root.appendingPathComponent(relativePath).path)
    }

    private func code(_ relativePath: String) throws -> String {
        let text = try String(contentsOf: root.appendingPathComponent(relativePath), encoding: .utf8)
        return text.components(separatedBy: .newlines)
            .map { $0.components(separatedBy: "//").first ?? "" }
            .joined(separator: "\n")
    }

    private func swiftSources(under relativePath: String) -> [URL] {
        guard let walker = FileManager.default.enumerator(
            at: root.appendingPathComponent(relativePath), includingPropertiesForKeys: nil
        ) else { return [] }
        return walker.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
    }

    private let sdkMedia = "packages/MeeshySDK/Sources/MeeshyUI/Media"
    private let sdkStory = "packages/MeeshySDK/Sources/MeeshyUI/Story"
    private let appViews = "apps/ios/Meeshy/Features/Main/Views"

    // MARK: - Les fichiers sans appelant

    func test_theGuardSeesTheSources() {
        XCTAssertTrue(exists("\(sdkMedia)/MeeshyVideoPlayer.swift"))
        XCTAssertGreaterThan(swiftSources(under: "apps/ios/Meeshy").count, 100)
    }

    func test_theDeadSdkPlayersAreGone() {
        for path in [
            "\(sdkStory)/StoryAudioPlayerView.swift",
            "\(sdkStory)/StoryVideoPlayerView.swift",
            "\(sdkMedia)/MeeshyVideoPlayer+FlatRenderer.swift",
            "\(sdkMedia)/MeeshyVideoCanvasLayer.swift",
        ] {
            XCTAssertFalse(exists(path), "\(path) n'a aucun appelant à l'exécution : il ne revient pas")
        }
    }

    func test_theDeadAppUploaderIsGone() {
        for path in [
            "apps/ios/Meeshy/Features/Main/Services/AttachmentUploader.swift",
            "apps/ios/MeeshyTests/Mocks/MockAttachmentUploader.swift",
            "apps/ios/MeeshyTests/Unit/Services/AttachmentUploaderTests.swift",
        ] {
            XCTAssertFalse(exists(path), path)
        }
    }

    func test_noSourceNamesARemovedType() {
        let removed = [
            "StoryAudioPlayerView", "StoryVideoPlayerView", "VideoPlayerCoordinator",
            "_FlatRenderer", "_MiniRenderer", "MeeshyVideoCanvasLayer",
            "AttachmentUploader", "AttachmentUploading", "VideoFullscreenPlayer(",
        ]
        var offenders: [String] = []
        for relative in ["packages/MeeshySDK/Sources", "apps/ios/Meeshy"] {
            for file in swiftSources(under: relative) {
                guard let text = try? String(contentsOf: file, encoding: .utf8) else { continue }
                let live = text.components(separatedBy: .newlines)
                    .map { $0.components(separatedBy: "//").first ?? "" }
                    .joined(separator: "\n")
                for name in removed where live.contains(name) {
                    offenders.append("\(file.lastPathComponent) → \(name)")
                }
            }
        }
        XCTAssertTrue(offenders.isEmpty, offenders.joined(separator: "\n"))
    }

    // MARK: - Le lecteur commun ne garde que ce qu'on appelle

    func test_videoPlayerStyle_onlyKeepsInlineAndFullscreen() throws {
        let source = try code("\(sdkMedia)/MeeshyVideoPlayer.swift")
        let start = try XCTUnwrap(source.range(of: "public enum Style: Sendable {"))
        let end = try XCTUnwrap(source.range(of: "}", range: start.upperBound..<source.endIndex))
        let block = String(source[start.upperBound..<end.lowerBound])
        XCTAssertTrue(block.contains("case inline"))
        XCTAssertTrue(block.contains("case fullscreen"))
        XCTAssertFalse(block.contains("case flat"), "aucun appelant ne passe `style: .flat`")
        XCTAssertFalse(block.contains("case mini"), "aucun appelant ne passe `style: .mini`")
    }

    func test_performanceOptions_dropsTheKnobsNobodyReads() throws {
        let source = try code("\(sdkMedia)/MeeshyVideoPlayer.swift")
        for knob in ["sharedPlayer", "preloadOnAppear", "preferredPeakBitRate"] {
            XCTAssertFalse(source.contains(knob), "\(knob) n'est lu par aucun renderer")
        }
    }

    // MARK: - L'aperçu plein écran de la citation passe par le lecteur commun

    func test_legacyFullscreenPlayerIsAbsorbed() throws {
        let legacy = try code("\(appViews)/VideoLegacySupport.swift")
        XCTAssertFalse(legacy.contains("struct VideoFullscreenPlayer"))
        XCTAssertFalse(legacy.contains("AVPlayer(url:"),
                       "plus de lecteur nu : rate posé avant le montage, aucune session audio")
    }

    func test_quotedMediaPreview_playsVideoAndAudioThroughTheCommonPlayer() throws {
        let host = try code("\(appViews)/ConversationView+Presentations.swift")
        XCTAssertTrue(host.contains("case \"video\", \"audio\":"),
                      "l'usage AUDIO de l'aperçu est gardé, sur le même chemin que la vidéo")
        XCTAssertTrue(host.contains("ComposerQuotedPlaybackFullscreen("))

        let media = try code("\(appViews)/ConversationPresentedMedia.swift")
        XCTAssertTrue(media.contains("MeeshyVideoPlayer("))
        XCTAssertTrue(media.contains("style: .fullscreen"))
        XCTAssertTrue(media.contains("controls: .fullscreenPreview"),
                      "l'aperçu d'une citation n'offre aucune sortie (ni enregistrer, ni partager)")
        XCTAssertTrue(media.contains("reportsConsumption: media.reportsConsumption"),
                      "un son joué par le moteur vidéo ne se rapporte pas « vu »")
        XCTAssertTrue(media.contains("VideoAvailabilityResolver("),
                      "le moteur partagé ne lit que le cache vidéo : la disponibilité passe par le résolveur")
    }
}
