import Foundation

/// Bounded undo / redo stack for `VideoEditDocument`.
///
/// Editing is non-destructive, so history is just an ordered list of document
/// snapshots. The stack is capped at `VideoEditLimits.historyDepth` so a long
/// session cannot grow memory without bound.
public struct VideoEditHistory: Sendable {
    private var past: [VideoEditDocument]
    private var future: [VideoEditDocument]
    private let depth: Int

    public private(set) var current: VideoEditDocument

    public init(initial: VideoEditDocument, depth: Int = VideoEditLimits.historyDepth) {
        self.current = initial
        self.past = []
        self.future = []
        self.depth = max(1, depth)
    }

    public var canUndo: Bool { !past.isEmpty }
    public var canRedo: Bool { !future.isEmpty }
    public var undoCount: Int { past.count }

    /// Records a new state. Identical documents (same content) are ignored so
    /// idempotent edits do not pollute the stack. Any redo branch is dropped.
    public mutating func commit(_ document: VideoEditDocument) {
        guard document != current else { return }
        past.append(current)
        if past.count > depth {
            past.removeFirst(past.count - depth)
        }
        current = document
        future.removeAll()
    }

    @discardableResult
    public mutating func undo() -> VideoEditDocument? {
        guard let previous = past.popLast() else { return nil }
        future.append(current)
        current = previous
        return current
    }

    @discardableResult
    public mutating func redo() -> VideoEditDocument? {
        guard let next = future.popLast() else { return nil }
        past.append(current)
        current = next
        return current
    }

    /// Drops all recorded history but keeps the current document — used once
    /// an edit has been exported / consumed so the autosave slot can be freed.
    public mutating func clearHistory() {
        past.removeAll()
        future.removeAll()
    }
}
