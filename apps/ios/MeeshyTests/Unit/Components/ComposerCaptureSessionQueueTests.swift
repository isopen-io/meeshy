import XCTest
@testable import Meeshy

/// **Une seule file ordonne la session** (#9464) : configurer, lancer et
/// arrêter passent l'un après l'autre, jamais dans le désordre de deux tâches
/// détachées.
@MainActor
final class ComposerCaptureSessionQueueTests: XCTestCase {

    private final class RecordingSession: ComposerCaptureRunning, @unchecked Sendable {
        private let lock = NSLock()
        private var running = false
        private var calls: [String] = []

        var isRunning: Bool {
            lock.lock(); defer { lock.unlock() }
            return running
        }
        var journal: [String] {
            lock.lock(); defer { lock.unlock() }
            return calls
        }
        func startRunning() {
            lock.lock(); defer { lock.unlock() }
            running = true
            calls.append("start")
        }
        func stopRunning() {
            lock.lock(); defer { lock.unlock() }
            running = false
            calls.append("stop")
        }
    }

    func test_setRunning_disarmThenRearmQuickly_leavesTheSessionRunning() {
        let file = ComposerCaptureSessionQueue()
        let session = RecordingSession()
        file.setRunning(true, session)
        file.setRunning(false, session)
        file.setRunning(true, session)
        file.drain()
        XCTAssertTrue(session.isRunning, "le dernier vœu gagne : réarmer vite ne laisse pas un viseur noir")
        XCTAssertEqual(session.journal.last, "start")
    }

    func test_setRunning_armThenDisarm_leavesTheSessionStopped() {
        let file = ComposerCaptureSessionQueue()
        let session = RecordingSession()
        file.setRunning(true, session)
        file.setRunning(false, session)
        file.drain()
        XCTAssertFalse(session.isRunning, "fermer le viseur coupe la caméra, même si l'ouverture n'était pas finie")
    }

    func test_perform_runsInOrderOnOneQueue() {
        let file = ComposerCaptureSessionQueue()
        let session = RecordingSession()
        file.perform { session.startRunning() }
        file.perform { session.stopRunning() }
        file.drain()
        XCTAssertEqual(session.journal, ["start", "stop"])
    }

    func test_camera_noLongerStartsOrStopsFromDetachedTasks() throws {
        let camera = try Self.code("Meeshy/Features/Main/Components/CameraModel.swift")
        XCTAssertFalse(camera.contains("Task.detached"), "deux tâches détachées ne s'ordonnent pas")
        XCTAssertTrue(camera.contains("sessionQueue.setRunning(true"))
        XCTAssertTrue(camera.contains("sessionQueue.setRunning(false"))
    }

    private static func code(_ relative: String) throws -> String {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return AppSourceGuard.stripComments(try String(
            contentsOf: racine.appendingPathComponent(relative), encoding: .utf8))
    }
}
