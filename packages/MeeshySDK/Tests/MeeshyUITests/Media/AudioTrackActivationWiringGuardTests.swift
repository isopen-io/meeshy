import XCTest

/// **Les surfaces muettes passent par la loi d'activation des pistes (#11282).**
///
/// Le décodage d'un `AVPlayerItemTrack` n'est pas atteignable sans média réel :
/// ces gardes lisent la source pour prouver que le moteur partagé, la vignette
/// muette du fil et l'aperçu d'appui long appellent `AudioTrackActivator` — les
/// témoins de valeur sont dans `AudioTrackActivationLawTests`.
final class AudioTrackActivationWiringGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Media/
            .deletingLastPathComponent()   // MeeshyUITests/
            .deletingLastPathComponent()   // Tests/
            .deletingLastPathComponent()   // MeeshySDK/
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func body(of signature: String, in text: String) throws -> String {
        let start = try XCTUnwrap(text.range(of: signature), "\(signature) introuvable")
        let rest = text[start.upperBound...]
        let end = rest.range(of: "\n    }\n")?.lowerBound ?? rest.endIndex
        return String(rest[..<end])
    }

    private let engine = "Sources/MeeshyUI/Media/SharedAVPlayerManager.swift"

    func test_muteChange_goesThroughTheLaw_neverWritesTheFlagAlone() throws {
        let apply = try body(of: "private func applyMuteState() {", in: source(engine))
        XCTAssertTrue(apply.contains("audioTracks.apply(to: player, wantsMuted: effectiveMuted)"),
                      "couper la sortie sans éteindre la piste laisserait le décodeur tourner")
        XCTAssertFalse(apply.contains("player?.isMuted = effectiveMuted"))
    }

    func test_newPlayer_bindsItsAudioTracks_beforeAnyOtherObserver() throws {
        let observers = try body(of: "private func setupObservers(for player: AVPlayer) {", in: source(engine))
        XCTAssertTrue(observers.contains("bindAudioTracks(to: player)"),
                      "un lecteur adopté ou créé doit recevoir l'état de ses pistes")
    }

    func test_cleanup_releasesTheTrackObservers() throws {
        let cleanup = try body(of: "private func cleanup() {", in: source(engine))
        XCTAssertTrue(cleanup.contains("audioTracks.release()"))
    }

    func test_recycledPlayer_returnsToThePoolWithItsAudioTracksOn() throws {
        let recycle = try body(of: "func recycle(",
                               in: source("Sources/MeeshyUI/Media/SharedAVPlayerManager+Preroll.swift"))
        let restore = try XCTUnwrap(recycle.range(of: "audioTracks.restore(of: outgoing)")?.lowerBound,
                                    "le pool sert aussi le lecteur de stories : jamais rendu piste éteinte")
        let giveBack = try XCTUnwrap(recycle.range(of: "StoryMediaLoader.shared.returnPlayer(")?.lowerBound)
        XCTAssertLessThan(restore, giveBack)
    }

    func test_flatThumbnail_bindsItsPlayerAsAlwaysMuted() throws {
        let text = try source("Sources/MeeshyUI/Media/MeeshyVideoPlayer+FlatRenderer.swift")
        XCTAssertTrue(text.contains("audioTracks.bind(to: queue, effectiveMuted: { true })"),
                      "la vignette muette de chaque bulle et carte du fil ne décode pas d'audio")
        XCTAssertTrue(text.contains("audioTracks.release()"))
    }

    func test_longPressPreview_bindsItsPlayerAsAlwaysMuted() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("apps/ios/Meeshy/Features/Main/Components/AttachmentQuickLookPreview.swift")
        let text = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(text.contains("audioTracks.bind(to: queue, effectiveMuted: { true })"))
    }
}
