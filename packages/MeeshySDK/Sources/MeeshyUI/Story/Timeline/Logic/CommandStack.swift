//
// CommandStack.swift
// MeeshyUI / Story / Timeline / Logic
//
// Linear undo/redo stack with FIFO cap (default 50) and time-based
// coalescing (default 0.5s). Snapshot/restore enables persistence to
// `{draft}.commands.json` so undo history survives composer close/reopen.
//
// Spec: docs/superpowers/specs/2026-05-05-story-timeline-editor-design.md §4.2
//
// No UIKit / SwiftUI imports — testable as pure logic.
//

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
/// Isolated to `@MainActor`: all access must occur on the main actor, matching
/// the `TimelineViewModel` that owns this stack. Swift 6 infers `Sendable`
/// conformance automatically for `@MainActor`-isolated types.
@MainActor
public final class CommandStack {

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
    ///     (currently MoveClip, TrimClip and MoveKeyframe — all emitted at
    ///     ~60fps during gesture drags and would otherwise saturate the FIFO
    ///     cap in under one second). MoveKeyframe also requires same
    ///     `keyframeId` since one clip can host many keyframes.
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
        case let (.trimClip(p), .trimClip(n))
            where p.clipId == n.clipId
              && p.kind == n.kind
              && abs(n.timestamp.timeIntervalSince(p.timestamp)) <= windowSeconds:
            // Preserve the "before-drag" state (p.old*) and the "current-drag"
            // state (n.new*) so the merged command's revert() rolls all the
            // way back to the pre-drag values in a single undo step.
            let merged = TrimClipCommand(
                id: n.id,
                timestamp: n.timestamp,
                clipId: n.clipId,
                kind: n.kind,
                oldStartTime: p.oldStartTime,
                oldDuration: p.oldDuration,
                newStartTime: n.newStartTime,
                newDuration: n.newDuration
            )
            return .trimClip(merged)
        case let (.moveKeyframe(p), .moveKeyframe(n))
            where p.clipId == n.clipId
              && p.kind == n.kind
              && p.keyframeId == n.keyframeId
              && abs(n.timestamp.timeIntervalSince(p.timestamp)) <= windowSeconds:
            // 60fps drag on a position / scale / opacity slider would saturate
            // the FIFO cap in <1s without coalescing. Same contract as
            // moveClip / trimClip: preserve p.old* + n.new* so a single undo
            // rolls back to the pre-drag value across the whole gesture.
            //
            // Per-axis merge rule: oldValue = first non-nil between (p.old, n.old);
            // newValue = last non-nil between (p.new, n.new). This lets a
            // sequence "scale-edit then opacity-edit" collapse to ONE command
            // that carries BOTH deltas — neither axis erases the other.
            let merged = MoveKeyframeCommand(
                id: n.id,
                timestamp: n.timestamp,
                clipId: n.clipId,
                kind: n.kind,
                keyframeId: n.keyframeId,
                oldTime: p.oldTime,
                newTime: n.newTime,
                oldX: p.oldX ?? n.oldX, newX: n.newX ?? p.newX,
                oldY: p.oldY ?? n.oldY, newY: n.newY ?? p.newY,
                oldScale: p.oldScale ?? n.oldScale,
                newScale: n.newScale ?? p.newScale,
                oldOpacity: p.oldOpacity ?? n.oldOpacity,
                newOpacity: n.newOpacity ?? p.newOpacity,
                oldEasing: p.oldEasing ?? n.oldEasing,
                newEasing: n.newEasing ?? p.newEasing
            )
            return .moveKeyframe(merged)
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
