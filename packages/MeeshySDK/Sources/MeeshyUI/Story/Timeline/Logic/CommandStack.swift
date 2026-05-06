import Foundation
import MeeshySDK

// MARK: - CommandStackSnapshot

/// Persistable snapshot of a CommandStack — written to `{draft}.commands.json`
/// alongside the draft itself. Versioning is by JSON shape; any new field added
/// later must be `Optional` + `decodeIfPresent` to preserve forward compat.
public struct CommandStackSnapshot: Codable, Sendable {
    public let commands: [AnyEditCommand]
    public let cursor: Int

    public init(commands: [AnyEditCommand], cursor: Int) {
        self.commands = commands
        self.cursor = cursor
    }
}

// MARK: - CommandStack

/// Linear undo/redo stack with FIFO cap and time-based coalescing.
///
/// Thread safety: a single instance is intended to be owned by one
/// `@MainActor` view model. The class is `@unchecked Sendable` because all
/// mutation goes through methods, but the contract is "one owner, main actor".
public final class CommandStack: @unchecked Sendable {

    /// Maximum number of commands kept on the stack. Older commands are evicted
    /// FIFO when the cap is reached. Always >= 1.
    public let maxSize: Int

    /// Time window in seconds during which a same-kind, same-target command
    /// will be merged into the previous one (the new replaces the old).
    public let coalesceWindow: TimeInterval

    /// Optional callback fired after any state-changing operation:
    /// push (whether coalesced or not), undo, redo, restore.
    public var didChange: ((CommandStack) -> Void)?

    private var commands: [AnyEditCommand] = []
    private var cursor: Int = 0
    // cursor invariant: commands[0..<cursor] are "applied", commands[cursor..<count] are "redo-able"

    public init(maxSize: Int = 50, coalesceWindow: TimeInterval = 0.5) {
        self.maxSize = max(1, maxSize)
        self.coalesceWindow = coalesceWindow
    }

    public var canUndo: Bool { cursor > 0 }
    public var canRedo: Bool { cursor < commands.count }
}
