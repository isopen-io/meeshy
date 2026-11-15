import XCTest
import Combine
@testable import MeeshySDK

/// #11040 — l'aperçu d'un son se met en pause quand un appel arrive ou
/// qu'une autre app lance un son, et reprend à la fin de l'interruption.
/// Il était arrêté net, sa session rendue : rien ne pouvait reprendre.
@MainActor
final class AudioPlayerInterruptionResumeTests: XCTestCase {

    private var file: URL!

    override func setUp() {
        super.setUp()
        file = FileManager.default.temporaryDirectory.appendingPathComponent("tone-\(UUID().uuidString).wav")
        try? Self.silentWAV(seconds: 4).write(to: file)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: file)
        super.tearDown()
    }

    private func makePlayingManager() throws -> AudioPlayerManager {
        let manager = AudioPlayerManager(sessionEvents: Empty().eraseToAnyPublisher())
        manager.sessionReleaser = {}
        manager.playLocalFile(url: file)
        try XCTSkipUnless(manager.isPlaying, "précondition : la lecture a démarré")
        return manager
    }

    func test_anInterruption_pausesThePlayback() throws {
        let manager = try makePlayingManager()
        defer { manager.stop() }

        manager.handleSessionEvent(.interruptionBegan)

        XCTAssertFalse(manager.isPlaying)
    }

    func test_theEndOfTheInterruption_resumesWhatWasPlaying() throws {
        let manager = try makePlayingManager()
        defer { manager.stop() }
        manager.handleSessionEvent(.interruptionBegan)

        manager.handleSessionEvent(.interruptionEndedShouldResume)

        XCTAssertTrue(manager.isPlaying)
    }

    func test_theEndWithoutShouldResume_leavesItPaused() throws {
        let manager = try makePlayingManager()
        defer { manager.stop() }
        manager.handleSessionEvent(.interruptionBegan)

        manager.handleSessionEvent(.interruptionEndedShouldNotResume)

        XCTAssertFalse(manager.isPlaying)
    }

    func test_aPausedPreview_isNotRestartedByTheEndOfAnInterruption() throws {
        let manager = try makePlayingManager()
        defer { manager.stop() }
        manager.togglePlayPause()

        manager.handleSessionEvent(.interruptionBegan)
        manager.handleSessionEvent(.interruptionEndedShouldResume)

        XCTAssertFalse(manager.isPlaying)
    }

    func test_aStoppedPlayerMidTrack_waitsForTheInterruptionInsteadOfGivingUp() {
        XCTAssertEqual(AudioPlayerManager.stoppedTickVerdict(currentTime: 1.2, duration: 4), .interrupted)
        XCTAssertEqual(AudioPlayerManager.stoppedTickVerdict(currentTime: 0, duration: 4), .finished)
        XCTAssertEqual(AudioPlayerManager.stoppedTickVerdict(currentTime: 4, duration: 4), .finished)
    }

    /// PCM 16 bits mono 8 kHz.
    private static func silentWAV(seconds: Int) -> Data {
        let samples = 8_000 * seconds, dataSize = samples * 2
        var data = Data()
        func u32(_ v: UInt32) { withUnsafeBytes(of: v.littleEndian) { data.append(contentsOf: $0) } }
        func u16(_ v: UInt16) { withUnsafeBytes(of: v.littleEndian) { data.append(contentsOf: $0) } }
        data.append(contentsOf: Array("RIFF".utf8)); u32(UInt32(36 + dataSize)); data.append(contentsOf: Array("WAVE".utf8))
        data.append(contentsOf: Array("fmt ".utf8)); u32(16); u16(1); u16(1); u32(8_000); u32(16_000); u16(2); u16(16)
        data.append(contentsOf: Array("data".utf8)); u32(UInt32(dataSize)); data.append(Data(count: dataSize))
        return data
    }
}
