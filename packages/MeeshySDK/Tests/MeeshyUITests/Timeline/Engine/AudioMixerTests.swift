import XCTest
import AVFoundation
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class AudioMixerTests: XCTestCase {

    // MARK: - C1 init defaults

    func test_init_defaultMaxActiveNodes_isSix() {
        let mixer = AudioMixer()
        XCTAssertEqual(mixer.maxActiveNodes, 6)
    }

    func test_init_isMutedDefaultsToFalse() {
        let mixer = AudioMixer()
        XCTAssertFalse(mixer.isMuted)
    }

    // MARK: - C2 configure

    func test_configure_withZeroAudios_hasNoNodes() throws {
        let mixer = AudioMixer()
        try mixer.configure(audios: [], urls: [:])
        XCTAssertEqual(mixer.activeNodeCount, 0)
    }

    func test_configure_withMissingURL_skipsNode() throws {
        let mixer = AudioMixer()
        let audio = StoryAudioPlayerObject(id: "a1", postMediaId: "pma1")
        try mixer.configure(audios: [audio], urls: [:])
        XCTAssertEqual(mixer.activeNodeCount, 0)
    }

    func test_configure_capsAtMaxActiveNodes() throws {
        let mixer = AudioMixer(maxActiveNodes: 2)
        let audios = (0..<5).map { StoryAudioPlayerObject(id: "a\($0)", postMediaId: "pm\($0)") }
        let urls = Dictionary(uniqueKeysWithValues: audios.map { ($0.id, URL(fileURLWithPath: "/nonexistent/\($0.id).m4a")) })
        try mixer.configure(audios: audios, urls: urls)
        XCTAssertLessThanOrEqual(mixer.activeNodeCount, 2)
    }

    func test_configure_appliesVolumeFromAudioObject() throws {
        let mixer = AudioMixer()
        let audio = StoryAudioPlayerObject(id: "a1", postMediaId: "pma1", volume: 0.6)
        try mixer.configure(audios: [audio], urls: [:])
        XCTAssertEqual(mixer.intendedVolume(for: "a1"), 0.6)
    }

    // MARK: - C3 play/pause

    func test_play_withZeroNodes_doesNotThrow() throws {
        let mixer = AudioMixer()
        try mixer.configure(audios: [], urls: [:])
        XCTAssertNoThrow(try mixer.play())
    }

    func test_pause_isIdempotent() {
        let mixer = AudioMixer()
        mixer.pause()
        mixer.pause()
        XCTAssertFalse(mixer.isPlaying)
    }

    func test_play_setsIsPlayingTrue() throws {
        let mixer = AudioMixer()
        try mixer.configure(audios: [], urls: [:])
        try mixer.play()
        XCTAssertTrue(mixer.isPlaying)
        mixer.pause()
        XCTAssertFalse(mixer.isPlaying)
    }

    // MARK: - C4 seek

    func test_seek_clampsNegativeToZero() throws {
        let mixer = AudioMixer()
        try mixer.configure(audios: [], urls: [:])
        mixer.seek(to: -3)
        XCTAssertEqual(mixer.lastSeekTime, 0, accuracy: 0.001)
    }

    func test_seek_recordsLastSeekTime() throws {
        let mixer = AudioMixer()
        try mixer.configure(audios: [], urls: [:])
        mixer.seek(to: 4.2)
        XCTAssertEqual(mixer.lastSeekTime, 4.2, accuracy: 0.001)
    }

    // MARK: - C5 setVolume + setMute

    func test_setVolume_clampsAboveOneToOne() {
        let mixer = AudioMixer()
        mixer.setVolume(2.5, for: "a1")
        XCTAssertEqual(mixer.intendedVolume(for: "a1"), 1.0)
    }

    func test_setVolume_clampsBelowZeroToZero() {
        let mixer = AudioMixer()
        mixer.setVolume(-0.5, for: "a1")
        XCTAssertEqual(mixer.intendedVolume(for: "a1"), 0)
    }

    func test_setMute_overridesVolumeToZero() {
        let mixer = AudioMixer()
        mixer.setVolume(0.7, for: "a1")
        mixer.setMute(true)
        XCTAssertTrue(mixer.isMuted)
        XCTAssertEqual(mixer.intendedVolume(for: "a1"), 0.7)
    }

    func test_setMute_unmuteRestoresVolume() {
        let mixer = AudioMixer()
        mixer.setVolume(0.4, for: "a1")
        mixer.setMute(true)
        mixer.setMute(false)
        XCTAssertFalse(mixer.isMuted)
        XCTAssertEqual(mixer.intendedVolume(for: "a1"), 0.4)
    }
}
