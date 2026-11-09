import XCTest
@preconcurrency import WebRTC
@testable import Meeshy

/// #17039 — la file du moteur d'appel : ce qu'on lui remet ne s'exécute
/// jamais sur le fil principal, et passe dans l'ordre de remise (une fermeture
/// de lien ne double jamais l'encodage qui la précède).
final class CallEngineQueueTests: XCTestCase {

    private final class Journal: @unchecked Sendable {
        private let lock = NSLock()
        private var entries: [String] = []
        private var mainThreadHits = 0
        func record(_ entry: String) {
            lock.lock(); defer { lock.unlock() }
            entries.append(entry)
            if Thread.isMainThread { mainThreadHits += 1 }
        }
        var snapshot: (entries: [String], mainThreadHits: Int) {
            lock.lock(); defer { lock.unlock() }
            return (entries, mainThreadHits)
        }
    }

    func test_run_fromMainThread_runsOffMainThread() {
        let journal = Journal()
        let done = expectation(description: "travail exécuté")
        DispatchQueue.main.async {
            CallEngineQueue.run {
                journal.record("cargo")
                done.fulfill()
            }
        }
        wait(for: [done], timeout: 5)
        XCTAssertEqual(journal.snapshot.entries, ["cargo"])
        XCTAssertEqual(journal.snapshot.mainThreadHits, 0, "un appel WebRTC bloquant ne doit jamais tourner sur le fil principal")
    }

    func test_run_runsWorkInHandOrder() {
        let journal = Journal()
        let done = expectation(description: "tout exécuté")
        done.expectedFulfillmentCount = 50
        for index in 0..<50 {
            CallEngineQueue.run {
                journal.record("\(index)")
                done.fulfill()
            }
        }
        wait(for: [done], timeout: 5)
        XCTAssertEqual(journal.snapshot.entries, (0..<50).map { "\($0)" })
    }

    func test_run_returnsBeforeTheWorkFinishes() {
        let gate = DispatchSemaphore(value: 0)
        let finished = expectation(description: "travail terminé")
        let start = Date()
        CallEngineQueue.run {
            gate.wait()
            finished.fulfill()
        }
        XCTAssertLessThan(Date().timeIntervalSince(start), 0.1, "remettre un travail ne doit pas attendre qu'il finisse")
        gate.signal()
        wait(for: [finished], timeout: 5)
    }

    func test_isCurrent_isTrueOnlyInsideHandedWork() {
        XCTAssertFalse(CallEngineQueue.isCurrent)
        let observed = expectation(description: "observé")
        let journal = Journal()
        CallEngineQueue.run {
            journal.record(CallEngineQueue.isCurrent ? "dedans" : "dehors")
            observed.fulfill()
        }
        wait(for: [observed], timeout: 5)
        XCTAssertEqual(journal.snapshot.entries, ["dedans"])
    }
}

/// #17039 — une vue vidéo démontée ne reçoit plus d'image : la porte se ferme
/// SYNCHRONEMENT au démontage, avant que le détachement de la piste (bloquant)
/// ne parte sur la file du moteur.
final class CallVideoRendererGateTests: XCTestCase {

    private final class RecordingRenderer: NSObject, RTCVideoRenderer, @unchecked Sendable {
        private let lock = NSLock()
        private var _frames = 0
        private var _sizes: [CGSize] = []
        var frames: Int { lock.lock(); defer { lock.unlock() }; return _frames }
        var sizes: [CGSize] { lock.lock(); defer { lock.unlock() }; return _sizes }
        func setSize(_ size: CGSize) { lock.lock(); _sizes.append(size); lock.unlock() }
        func renderFrame(_ frame: RTCVideoFrame?) { lock.lock(); _frames += 1; lock.unlock() }
    }

    func test_openGate_forwardsFramesAndSizes() {
        let target = RecordingRenderer()
        let gate = CallVideoRendererGate(target: target)
        gate.renderFrame(nil)
        gate.setSize(CGSize(width: 640, height: 480))
        XCTAssertEqual(target.frames, 1)
        XCTAssertEqual(target.sizes, [CGSize(width: 640, height: 480)])
    }

    func test_closedGate_forwardsNothing() {
        let target = RecordingRenderer()
        let gate = CallVideoRendererGate(target: target)
        gate.close()
        gate.renderFrame(nil)
        gate.setSize(CGSize(width: 1, height: 1))
        XCTAssertEqual(target.frames, 0, "une vue démontée ne doit plus recevoir d'image")
        XCTAssertTrue(target.sizes.isEmpty)
    }

    func test_gate_doesNotRetainItsView() {
        weak var released: RecordingRenderer?
        var gate: CallVideoRendererGate?
        autoreleasepool {
            let target = RecordingRenderer()
            released = target
            gate = CallVideoRendererGate(target: target)
        }
        XCTAssertNil(released, "la porte, retenue par la piste jusqu'au détachement différé, ne doit pas faire survivre la vue (UIView libérée hors du fil principal)")
        gate?.renderFrame(nil)
    }
}
