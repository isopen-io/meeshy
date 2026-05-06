import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class CommandStackTests: XCTestCase {

    // MARK: - Helpers

    /// Factory: produces a fresh AddClipCommand wrapped in AnyEditCommand.
    /// Each call creates a new UUID + timestamp.
    private func makeAddCmd(clipId: String = UUID().uuidString,
                            timestamp: Date = Date()) -> AnyEditCommand {
        return .addClip(AddClipCommand(
            id: UUID().uuidString,
            timestamp: timestamp,
            clipId: clipId,
            postMediaId: "pm-\(clipId)",
            kind: .video,
            startTime: 0,
            duration: 1.0,
            content: nil
        ))
    }

    private func makeMoveCmd(clipId: String = "c1",
                             oldStart: Float = 0,
                             newStart: Float = 1,
                             timestamp: Date = Date()) -> AnyEditCommand {
        return .moveClip(MoveClipCommand(
            id: UUID().uuidString,
            timestamp: timestamp,
            clipId: clipId,
            kind: .video,
            oldStartTime: oldStart,
            newStartTime: newStart
        ))
    }

    // MARK: - CommandStackSnapshot

    func test_snapshot_init_storesCommandsAndCursor() {
        let cmds = [makeAddCmd(), makeAddCmd()]
        let snap = CommandStackSnapshot(commands: cmds, cursor: 1)
        XCTAssertEqual(snap.commands.count, 2)
        XCTAssertEqual(snap.cursor, 1)
    }

    func test_snapshot_codableRoundTrip() throws {
        let cmds = [makeAddCmd(), makeMoveCmd()]
        let snap = CommandStackSnapshot(commands: cmds, cursor: 2)

        let data = try JSONEncoder().encode(snap)
        let decoded = try JSONDecoder().decode(CommandStackSnapshot.self, from: data)

        XCTAssertEqual(decoded.commands.count, 2)
        XCTAssertEqual(decoded.cursor, 2)
    }
}
