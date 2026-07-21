import XCTest
@testable import MeeshySDK

/// `playLocalFile` used to swallow every failure via an empty `catch {}` —
/// a tap on "play" for a file evicted from cache produced no sound, no log,
/// and no observable state change. These tests lock the do/catch + `lastError`
/// fix for both failure surfaces reachable from `playLocalFile`: the disk
/// read itself, and the downstream `AVAudioPlayer` decode inside `playData`.
@MainActor
final class AudioPlayerManagerTests: XCTestCase {

    func test_playLocalFile_missingFile_setsLastErrorAndStaysStopped() {
        let manager = AudioPlayerManager()
        let missingURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("missing-\(UUID().uuidString).m4a")

        manager.playLocalFile(url: missingURL)

        XCTAssertNotNil(manager.lastError,
                         "A missing file must surface a non-nil lastError instead of failing silently")
        XCTAssertFalse(manager.isPlaying,
                        "Playback must not report isPlaying after a failed local file read")
    }

    func test_playLocalFile_garbageAudioData_setsLastError() throws {
        let manager = AudioPlayerManager()
        let garbageURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("garbage-\(UUID().uuidString).m4a")
        try Data([0x00, 0x01, 0x02, 0x03]).write(to: garbageURL)
        defer { try? FileManager.default.removeItem(at: garbageURL) }

        manager.playLocalFile(url: garbageURL)

        XCTAssertNotNil(manager.lastError,
                         "Unplayable audio bytes must surface a non-nil lastError instead of failing silently")
        XCTAssertFalse(manager.isPlaying)
    }
}
