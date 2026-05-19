import Foundation

// MARK: - History Step

/// One entry in the edit history: a full `ImageEditState` snapshot plus a
/// human-readable label for the history scrubber.
public struct ImageEditHistoryStep: Identifiable, Equatable, Sendable {
    public let id: UUID
    public let state: ImageEditState
    public let label: String

    public init(id: UUID = UUID(), state: ImageEditState, label: String) {
        self.id = id
        self.state = state
        self.label = label
    }
}

// MARK: - Image Edit History

/// Snapshot-based undo / redo for the image editor.
///
/// Mirrors the cursor + array design of the Story timeline `CommandStack` but
/// stores full `ImageEditState` snapshots instead of diff commands. Each
/// snapshot is a ~100-byte value type and the source image is never copied, so
/// the history stays cheap and `undo` / `redo` / `jump` are all O(1).
///
/// The history is session-scoped: it is held by `ImageEditorViewModel` and
/// discarded when the editor is dismissed (i.e. once the media is exported or
/// the edit is abandoned), satisfying the "temporary history" requirement.
///
/// Pure value type — no UIKit / SwiftUI — so it is fully unit-testable.
public struct ImageEditHistory: Sendable, Equatable {

    /// All recorded steps, oldest first. Always contains at least the initial step.
    public private(set) var steps: [ImageEditHistoryStep]

    /// Index of the currently active step within `steps`.
    public private(set) var cursor: Int

    public init(initial: ImageEditState = .identity, initialLabel: String = "Original") {
        self.steps = [ImageEditHistoryStep(state: initial, label: initialLabel)]
        self.cursor = 0
    }

    public var current: ImageEditState { steps[cursor].state }
    public var currentStepID: UUID { steps[cursor].id }
    public var canUndo: Bool { cursor > 0 }
    public var canRedo: Bool { cursor < steps.count - 1 }
    public var count: Int { steps.count }

    /// Records a new state on top of the current cursor position. Any redo
    /// branch ahead of the cursor is discarded. A no-op when the incoming
    /// state is identical to the current one, which keeps idle gestures (a
    /// drag that ends where it started) out of the history.
    public mutating func record(_ state: ImageEditState, label: String) {
        guard state != steps[cursor].state else { return }
        if cursor < steps.count - 1 {
            steps.removeSubrange((cursor + 1)...)
        }
        steps.append(ImageEditHistoryStep(state: state, label: label))
        cursor = steps.count - 1
    }

    @discardableResult
    public mutating func undo() -> ImageEditState? {
        guard canUndo else { return nil }
        cursor -= 1
        return current
    }

    @discardableResult
    public mutating func redo() -> ImageEditState? {
        guard canRedo else { return nil }
        cursor += 1
        return current
    }

    /// Jumps the cursor directly to a step by id (history scrubbing). The
    /// branch is preserved — a later `record` from a jumped-back position
    /// discards the steps ahead, as with `undo`.
    @discardableResult
    public mutating func jump(to id: UUID) -> ImageEditState? {
        guard let index = steps.firstIndex(where: { $0.id == id }) else { return nil }
        cursor = index
        return current
    }
}
