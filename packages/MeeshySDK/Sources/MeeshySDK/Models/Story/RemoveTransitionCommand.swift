import CoreGraphics
import Foundation

public struct RemoveTransitionCommand: EditCommand {
    public let id: String
    public let timestamp: Date
    public let transitionId: String
    public let snapshot: StoryClipTransition
    public let insertionIndex: Int

    public init(id: String = UUID().uuidString,
                timestamp: Date = Date(),
                transitionId: String,
                snapshot: StoryClipTransition,
                insertionIndex: Int) {
        self.id = id
        self.timestamp = timestamp
        self.transitionId = transitionId
        self.snapshot = snapshot
        self.insertionIndex = insertionIndex
    }

    public func apply(to project: inout TimelineProject) throws {
        guard project.clipTransitions.contains(where: { $0.id == transitionId }) else {
            throw EditCommandError.transitionNotFound(id: transitionId)
        }
        project.clipTransitions.removeAll { $0.id == transitionId }
    }

    public func revert(from project: inout TimelineProject) throws {
        let idx = min(insertionIndex, project.clipTransitions.count)
        project.clipTransitions.insert(snapshot, at: idx)
    }
}
