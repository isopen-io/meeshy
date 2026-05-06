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

extension CommandStack {

    /// Total number of commands currently retained on the stack
    /// (includes both undone and applied).
    public var count: Int { commands.count }

    /// Push a command on top of the stack with optional coalescing.
    public func push(_ command: AnyEditCommand) {
        if cursor < commands.count {
            commands.removeSubrange(cursor..<commands.count)
        }

        if let last = commands.last,
           let merged = Self.coalesce(previous: last, with: command,
                                      windowSeconds: coalesceWindow) {
            commands[commands.count - 1] = merged
        } else {
            commands.append(command)
            // Enforce FIFO cap (only when we actually grew the stack).
            while commands.count > maxSize {
                commands.removeFirst()
            }
        }
        cursor = commands.count
        didChange?(self)
    }

    /// Returns a merged command if `previous` and `next` are coalesceable,
    /// otherwise `nil`. Two commands coalesce iff:
    ///   - they target the same clipId,
    ///   - they are of the same EditCommand type,
    ///   - they are within `windowSeconds` of each other,
    ///   - they belong to the (small) set of commands declared coalesceable
    ///     (currently MoveClip).
    private static func coalesce(previous: AnyEditCommand,
                         with next: AnyEditCommand,
                         windowSeconds: TimeInterval) -> AnyEditCommand? {
        switch (previous, next) {
        case let (.moveClip(p), .moveClip(n))
            where p.clipId == n.clipId
              && p.kind == n.kind
              && abs(n.timestamp.timeIntervalSince(p.timestamp)) <= windowSeconds:
            let merged = MoveClipCommand(
                id: n.id,
                timestamp: n.timestamp,
                clipId: n.clipId,
                kind: n.kind,
                oldStartTime: p.oldStartTime,
                newStartTime: n.newStartTime
            )
            return .moveClip(merged)
        default:
            return nil
        }
    }
}

extension CommandStack {

    /// Move the cursor one step back and return the command that was undone.
    /// Returns `nil` if there is nothing to undo (cursor at 0).
    /// The command is **not** removed from the stack — it remains available for redo.
    /// Calls `didChange` after the mutation completes.
    @discardableResult
    public func undo() -> AnyEditCommand? {
        guard canUndo else { return nil }
        cursor -= 1
        let cmd = commands[cursor]
        didChange?(self)
        return cmd
    }
}

extension CommandStack {

    /// Move the cursor one step forward (re-applying the previously undone command)
    /// and return that command. Returns `nil` if there is nothing to redo.
    /// Calls `didChange` after the mutation completes.
    @discardableResult
    public func redo() -> AnyEditCommand? {
        guard canRedo else { return nil }
        let cmd = commands[cursor]
        cursor += 1
        didChange?(self)
        return cmd
    }
}

extension CommandStack {

    /// Capture the current state for persistence. Safe to call on the main actor.
    public func snapshot() -> CommandStackSnapshot {
        return CommandStackSnapshot(commands: commands, cursor: cursor)
    }

    /// Replace the current state with a previously captured snapshot.
    /// Cursor is clamped to `[0, commands.count]` to tolerate corrupted snapshots.
    /// Calls `didChange` after the restore completes.
    public func restore(_ snapshot: CommandStackSnapshot) {
        self.commands = snapshot.commands
        self.cursor = max(0, min(snapshot.cursor, snapshot.commands.count))
        didChange?(self)
    }
}
