import XCTest
import AVFoundation
@testable import MeeshyUI

/// **La loi d'activation POSÉE sur un vrai lecteur (#11282).**
///
/// `AudioTrackActivationLawTests` prouve ce que la loi décide ; ces témoins
/// prouvent ce que `AudioTrackActivator` écrit réellement sur les
/// `AVPlayerItemTrack` d'un élément prêt — une piste audio de WAV généré,
/// aucun média embarqué.
@MainActor
final class AudioTrackActivatorTests: XCTestCase {

    // MARK: - Fixture

    private static func makeWavFixture(duration: Double = 0.5) throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("audio-track-activator-\(UUID().uuidString).wav")
        let format = try XCTUnwrap(AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1))
        let file = try AVAudioFile(forWriting: url, settings: format.settings)
        let frames = AVAudioFrameCount(44_100 * duration)
        let buffer = try XCTUnwrap(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames))
        buffer.frameLength = frames
        try file.write(from: buffer)
        return url
    }

    private func spin(until condition: () -> Bool, timeout: TimeInterval = 15) {
        let deadline = Date().addingTimeInterval(timeout)
        while !condition(), Date() < deadline {
            RunLoop.main.run(until: Date().addingTimeInterval(0.02))
        }
    }

    private func makeItem() throws -> AVPlayerItem {
        AVPlayerItem(url: try Self.makeWavFixture())
    }

    private func waitUntilReady(_ item: AVPlayerItem) {
        spin { item.status != .unknown }
        XCTAssertEqual(item.status, .readyToPlay, "le WAV généré doit être lisible")
        XCTAssertFalse(audioTracks(of: item).isEmpty, "l'élément prêt doit exposer sa piste audio")
    }

    private func makeReadyPlayer(muted: Bool) throws -> (player: AVPlayer, item: AVPlayerItem) {
        let item = try makeItem()
        let player = AVPlayer(playerItem: item)
        player.isMuted = muted
        waitUntilReady(item)
        return (player, item)
    }

    private func audioTracks(of item: AVPlayerItem) -> [AVPlayerItemTrack] {
        item.tracks.filter { $0.assetTrack?.mediaType == .audio }
    }

    private func audioTracksEnabled(_ item: AVPlayerItem) -> [Bool] {
        audioTracks(of: item).map(\.isEnabled)
    }

    // MARK: - apply

    func test_apply_muted_silencesTheOutputAndSwitchesTheAudioTrackOff() throws {
        let (player, item) = try makeReadyPlayer(muted: false)
        let activator = AudioTrackActivator()

        activator.apply(to: player, wantsMuted: true)

        XCTAssertTrue(player.isMuted)
        XCTAssertEqual(audioTracksEnabled(item), [false],
                       "muet, la piste audio ne se décode plus")
    }

    func test_apply_unmuted_switchesTheAudioTrackBackOnAndSoundsTheOutput() throws {
        let (player, item) = try makeReadyPlayer(muted: false)
        let activator = AudioTrackActivator()
        activator.apply(to: player, wantsMuted: true)

        activator.apply(to: player, wantsMuted: false)

        XCTAssertFalse(player.isMuted)
        XCTAssertEqual(audioTracksEnabled(item), [true], "au démute, le son revient")
    }

    func test_apply_outputOpenedBehindItsBack_stillSwitchesTheTrackBackOn() throws {
        let (player, item) = try makeReadyPlayer(muted: false)
        let activator = AudioTrackActivator()
        activator.apply(to: player, wantsMuted: true)
        player.isMuted = false

        activator.apply(to: player, wantsMuted: false)

        XCTAssertEqual(audioTracksEnabled(item), [true],
                       "une sortie ouverte par une surface ne laisse jamais la piste éteinte")
    }

    func test_apply_mutedPlayerWithLiveTrack_switchesTheTrackOff() throws {
        let (player, item) = try makeReadyPlayer(muted: true)
        let activator = AudioTrackActivator()

        activator.apply(to: player, wantsMuted: true)

        XCTAssertTrue(player.isMuted)
        XCTAssertEqual(audioTracksEnabled(item), [false],
                       "un lecteur rendu muet par le pool, pistes allumées, s'éteint quand même")
    }

    // MARK: - bind

    func test_bind_beforeTheItemIsReady_switchesTheTrackOffOnceItIs() throws {
        let item = try makeItem()
        let player = AVPlayer(playerItem: item)
        let activator = AudioTrackActivator()

        activator.bind(to: player, effectiveMuted: { true })
        waitUntilReady(item)
        spin { self.audioTracksEnabled(item) == [false] }

        XCTAssertTrue(player.isMuted)
        XCTAssertEqual(audioTracksEnabled(item), [false],
                       "l'état voulu se pose à l'instant où l'élément devient prêt")
        activator.release()
    }

    func test_bind_followsANewCurrentItem() throws {
        let (player, _) = try makeReadyPlayer(muted: true)
        let activator = AudioTrackActivator()
        activator.bind(to: player, effectiveMuted: { true })

        let next = try makeItem()
        player.replaceCurrentItem(with: next)
        waitUntilReady(next)
        spin { self.audioTracksEnabled(next) == [false] }

        XCTAssertEqual(audioTracksEnabled(next), [false],
                       "le successeur d'une boucle est éteint à son tour")
        activator.release()
    }

    func test_release_stopsFollowingTheItems() throws {
        let (player, _) = try makeReadyPlayer(muted: true)
        let activator = AudioTrackActivator()
        activator.bind(to: player, effectiveMuted: { true })
        activator.release()

        let next = try makeItem()
        player.replaceCurrentItem(with: next)
        waitUntilReady(next)
        RunLoop.main.run(until: Date().addingTimeInterval(0.2))

        XCTAssertEqual(audioTracksEnabled(next), [true],
                       "libéré, l'activateur n'écrit plus rien sur le lecteur")
    }

    // MARK: - restore

    func test_restore_switchesTheTracksBackOnWithoutOpeningTheOutput() throws {
        let (player, item) = try makeReadyPlayer(muted: false)
        let activator = AudioTrackActivator()
        activator.apply(to: player, wantsMuted: true)

        activator.restore(of: player)

        XCTAssertEqual(audioTracksEnabled(item), [true],
                       "le pool sert aussi les stories : jamais rendu piste éteinte")
        XCTAssertTrue(player.isMuted, "rendre les pistes n'ouvre pas la sortie")
    }
}
