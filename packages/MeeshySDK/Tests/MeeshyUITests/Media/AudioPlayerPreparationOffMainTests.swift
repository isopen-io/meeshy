import XCTest
import AVFoundation
@testable import MeeshyUI

/// #9702 — `AudioPlaybackManager.playData` décodait (`AVAudioPlayer(data:)`)
/// et préparait (`prepareToPlay()`) le vocal SUR le MainActor, au moment même
/// du geste qui lance la lecture ; et son minuteur de progression créait une
/// `Task` par tick. La préparation part désormais hors du fil principal, et le
/// tick reste sur le fil où le minuteur tire déjà.
@MainActor
final class AudioPlayerPreparationOffMainTests: XCTestCase {

    private func sdkSource(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Media/
            .deletingLastPathComponent()   // MeeshyUITests/
            .deletingLastPathComponent()   // Tests/
            .deletingLastPathComponent()   // MeeshySDK/
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// 0,1 s de silence PCM 16 bits mono à 8 kHz, en WAV.
    private func silentWAV(seconds: Double = 0.1, sampleRate: UInt32 = 8_000) -> Data {
        let samples = UInt32(Double(sampleRate) * seconds)
        let dataSize = samples * 2
        var data = Data()
        func append<T: FixedWidthInteger>(_ value: T) {
            withUnsafeBytes(of: value.littleEndian) { data.append(contentsOf: $0) }
        }
        data.append(contentsOf: Array("RIFF".utf8)); append(UInt32(36 + dataSize))
        data.append(contentsOf: Array("WAVE".utf8))
        data.append(contentsOf: Array("fmt ".utf8)); append(UInt32(16))
        append(UInt16(1)); append(UInt16(1)); append(sampleRate)
        append(sampleRate * 2); append(UInt16(2)); append(UInt16(16))
        data.append(contentsOf: Array("data".utf8)); append(dataSize)
        data.append(Data(count: Int(dataSize)))
        return data
    }

    func test_preparedPlayer_decodesValidAudio_withRateEnabled() async throws {
        let result = await AudioBytesLoader.preparedPlayer(from: silentWAV())

        let prepared = try result.get()
        XCTAssertEqual(prepared.player.duration, 0.1, accuracy: 0.02)
        XCTAssertTrue(prepared.player.enableRate,
                      "enableRate doit être posé AVANT prepareToPlay, sinon la vitesse est ignorée")
    }

    func test_preparedPlayer_garbageBytes_fails() async {
        let result = await AudioBytesLoader.preparedPlayer(from: Data([0x00, 0x01, 0x02, 0x03]))

        if case .success = result {
            XCTFail("Des octets illisibles ne doivent pas produire de lecteur")
        }
    }

    func test_playbackManager_preparesThroughTheDetachedLoader() throws {
        let source = try sdkSource("Sources/MeeshyUI/Media/AudioPlaybackManager.swift")

        XCTAssertFalse(source.contains("try AVAudioPlayer(data: data)"),
                       "Le décodage ne doit plus avoir lieu sur le MainActor (#9702)")
        XCTAssertTrue(source.contains("AudioBytesLoader.preparedPlayer(from: data)"))
        let loader = try sdkSource("Sources/MeeshyUI/Media/AudioBytesLoader.swift")
        XCTAssertTrue(loader.contains("prepareToPlay()"))
    }

    func test_progressTimers_doNotSpawnATaskPerTick() throws {
        for path in ["Sources/MeeshyUI/Media/AudioPlaybackManager.swift",
                     "Sources/MeeshySDK/Cache/AudioPlayerManager.swift"] {
            let source = try sdkSource(path)
            XCTAssertFalse(source.contains("repeats: true) { [weak self] _ in\n            Task {"),
                           "\(path) : le minuteur tire sur le fil principal, une Task par tick est superflue")
        }
    }
}
