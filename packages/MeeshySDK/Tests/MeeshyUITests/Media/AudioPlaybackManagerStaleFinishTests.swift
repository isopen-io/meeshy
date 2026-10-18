import Testing
import AVFoundation
@testable import MeeshyUI

/// La fin d'un lecteur qui n'est PLUS le lecteur courant ne termine rien.
///
/// `audioPlayerDidFinishPlaying` saute sur le MainActor par une `Task` : si le vocal B
/// démarre entre la fin de A et ce saut, la fin de A arrêtait B, avançait la file
/// d'autoplay et gravait B « écouté en entier » (position de reprise effacée).
@Suite("AudioPlaybackManager — une fin périmée ne termine pas la piste courante")
struct AudioPlaybackManagerStaleFinishTests {

    @Test("La fin d'un AVAudioPlayer étranger n'appelle pas onPlaybackFinished")
    @MainActor
    func test_finishFromAForeignPlayer_isIgnored() async throws {
        let manager = AudioPlaybackManager(registerWithCoordinator: false)
        var finishes = 0
        manager.onPlaybackFinished = { finishes += 1 }
        let foreign = try AVAudioPlayer(data: Self.silentWAV())

        manager.audioPlayerDidFinishPlaying(foreign, successfully: true)
        try await Task.sleep(nanoseconds: 100_000_000)

        #expect(finishes == 0)
    }

    /// 0,2 s de silence PCM 16 bits mono 8 kHz.
    private static func silentWAV() -> Data {
        let samples = 1_600, dataSize = samples * 2
        var data = Data()
        func u32(_ v: UInt32) { withUnsafeBytes(of: v.littleEndian) { data.append(contentsOf: $0) } }
        func u16(_ v: UInt16) { withUnsafeBytes(of: v.littleEndian) { data.append(contentsOf: $0) } }
        data.append(contentsOf: Array("RIFF".utf8)); u32(UInt32(36 + dataSize)); data.append(contentsOf: Array("WAVE".utf8))
        data.append(contentsOf: Array("fmt ".utf8)); u32(16); u16(1); u16(1); u32(8_000); u32(16_000); u16(2); u16(16)
        data.append(contentsOf: Array("data".utf8)); u32(UInt32(dataSize)); data.append(Data(count: dataSize))
        return data
    }
}
