import XCTest
@testable import Meeshy

@MainActor
final class MeeshyAppPushBootstrapOrderTests: XCTestCase {

    private final class Recorder {
        private(set) var events: [String] = []
        func record(_ event: String) { events.append(event) }
    }

    func test_runPushBootstrapSequence_registersVoIPBeforeRequestingPushPermission() async {
        let recorder = Recorder()

        await MeeshyApp.runPushBootstrapSequence(
            voipRegister: { recorder.record("voip") },
            requestPushPermission: { recorder.record("permission") }
        )

        XCTAssertEqual(recorder.events, ["voip", "permission"])
    }

    func test_runPushBootstrapSequence_voipRunsEvenIfPermissionRequestHangs() async {
        let recorder = Recorder()
        let permissionGate = AsyncGate()

        let task = Task {
            await MeeshyApp.runPushBootstrapSequence(
                voipRegister: { recorder.record("voip") },
                requestPushPermission: {
                    recorder.record("permission-start")
                    await permissionGate.wait()
                    recorder.record("permission-end")
                }
            )
        }

        // Give the sequence a chance to reach (and suspend on) the permission
        // gate. VoIP registration must already have happened by then — it
        // must never be blocked behind a pending permission prompt.
        while recorder.events.count < 2 {
            await Task.yield()
        }
        XCTAssertEqual(recorder.events, ["voip", "permission-start"])

        await permissionGate.open()
        await task.value
        XCTAssertEqual(recorder.events, ["voip", "permission-start", "permission-end"])
    }
}

/// Minimal async gate used to simulate a permission prompt that stays
/// pending until explicitly dismissed.
private actor AsyncGate {
    private var isOpen = false
    private var waiters: [CheckedContinuation<Void, Never>] = []

    func wait() async {
        if isOpen { return }
        await withCheckedContinuation { continuation in
            waiters.append(continuation)
        }
    }

    func open() {
        isOpen = true
        waiters.forEach { $0.resume() }
        waiters.removeAll()
    }
}
