import XCTest
@testable import MeeshySDK

/// `play` / `playLocalFile` prennent une session `.playback` NON mixable — la musique d'une autre app s'interrompt.
/// `stop()` ne la rendait pas : seule la `deinit` le faisait, et seulement si un lecteur restait (jamais après
/// `stop()`). Écouter un son dans le composeur de story laissait donc la musique coupée, sans
/// `.notifyOthersOnDeactivation`. `stop()` rend la session ; enchaîner deux lectures ne la rend PAS entre les deux.
@MainActor
final class AudioPlayerSessionReleaseTests: XCTestCase {

    private var releases = 0
    private var file: URL!

    override func setUp() {
        super.setUp()
        releases = 0
        file = FileManager.default.temporaryDirectory.appendingPathComponent("silence-\(UUID().uuidString).wav")
        try? Self.silentWAV().write(to: file)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: file)
        super.tearDown()
    }

    private func makeManager() -> AudioPlayerManager {
        let manager = AudioPlayerManager()
        manager.sessionReleaser = { [weak self] in self?.releases += 1 }
        return manager
    }

    func test_stoppingAPlayback_releasesTheSession() {
        let manager = makeManager()
        manager.playLocalFile(url: file)
        XCTAssertNil(manager.lastError, "précondition : la lecture a démarré")

        manager.stop()

        XCTAssertEqual(releases, 1)
    }

    func test_stoppingWhenNothingPlays_releasesNothing() {
        let manager = makeManager()
        manager.stop()
        XCTAssertEqual(releases, 0)
    }

    func test_chainingTwoPlaybacks_keepsTheSession_inBetween() {
        let manager = makeManager()
        manager.playLocalFile(url: file)
        manager.playLocalFile(url: file)
        XCTAssertEqual(releases, 0, "rendre puis reprendre la session ferait reprendre puis recouper la musique des autres apps")
        manager.stop()
        XCTAssertEqual(releases, 1)
    }

    /// À la fin NATURELLE d'une piste locale, `AVAudioPlayer.isPlaying` repasse à faux et `currentTime` revient
    /// à 0 : le tick sortait sur sa garde avant d'atteindre `>= 1.0`. L'aperçu restait « en lecture » pour
    /// toujours, le Timer 10 Hz tournait sans fin et la session `.playback` n'était jamais rendue.
    func test_aLocalPlaybackThatReachesItsEnd_stopsAndReleasesTheSession() {
        let manager = makeManager()
        manager.playLocalFile(url: file)
        XCTAssertTrue(manager.isPlaying, "précondition : la lecture a démarré")

        let ended = expectation(description: "fin de piste constatée")
        ended.assertForOverFulfill = false
        let poll = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { _ in
            MainActor.assumeIsolated {
                if !manager.isPlaying { ended.fulfill() }
            }
        }
        wait(for: [ended], timeout: 3)
        poll.invalidate()

        XCTAssertFalse(manager.isPlaying)
        XCTAssertEqual(releases, 1, "la session doit être rendue à la fin de la piste")
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
