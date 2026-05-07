import Foundation
import AVFoundation
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class MockAudioMixer: AudioMixerProviding {

    var isMuted: Bool = false
    var maxActiveNodes: Int = 6

    private(set) var configureCallCount = 0
    private(set) var lastConfiguredAudioCount = 0
    private(set) var playCallCount = 0
    private(set) var pauseCallCount = 0
    private(set) var seekCallCount = 0
    private(set) var lastSeekTime: Float = 0
    private(set) var setVolumeCalls: [(audioId: String, volume: Float)] = []
    private(set) var setMuteCalls: [Bool] = []
    private(set) var teardownCallCount = 0
    private(set) var prepareAllNodesCallCount = 0

    var configureError: Error?
    var playError: Error?

    func configure(audios: [StoryAudioPlayerObject], urls: [String: URL]) throws {
        configureCallCount += 1
        lastConfiguredAudioCount = audios.count
        if let err = configureError { throw err }
    }

    func play() throws {
        playCallCount += 1
        if let err = playError { throw err }
    }

    func pause() { pauseCallCount += 1 }

    func seek(to time: Float) {
        seekCallCount += 1
        lastSeekTime = time
    }

    func setVolume(_ volume: Float, for audioId: String) {
        setVolumeCalls.append((audioId, volume))
    }

    func setMute(_ muted: Bool) {
        setMuteCalls.append(muted)
        isMuted = muted
    }

    func teardown() { teardownCallCount += 1 }

    func prepareAllNodes() { prepareAllNodesCallCount += 1 }

    func reset() {
        configureCallCount = 0
        lastConfiguredAudioCount = 0
        playCallCount = 0
        pauseCallCount = 0
        seekCallCount = 0
        lastSeekTime = 0
        setVolumeCalls.removeAll()
        setMuteCalls.removeAll()
        teardownCallCount = 0
        prepareAllNodesCallCount = 0
        configureError = nil
        playError = nil
        isMuted = false
    }
}
