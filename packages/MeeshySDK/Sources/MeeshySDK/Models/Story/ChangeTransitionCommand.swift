import CoreGraphics
import Foundation

public struct ChangeTransitionCommand: EditCommand {
    public let id: String
    public let timestamp: Date
    public let transitionId: String
    public let previous: StoryClipTransition
    public let updated: StoryClipTransition

    public init(id: String = UUID().uuidString,
                timestamp: Date = Date(),
                transitionId: String,
                previous: StoryClipTransition,
                updated: StoryClipTransition) {
        self.id = id
        self.timestamp = timestamp
        self.transitionId = transitionId
        self.previous = previous
        self.updated = updated
    }

    public func apply(to project: inout TimelineProject) throws {
        guard let idx = project.clipTransitions.firstIndex(where: { $0.id == transitionId }) else {
            throw EditCommandError.transitionNotFound(id: transitionId)
        }
        project.clipTransitions[idx] = updated
    }

    public func revert(from project: inout TimelineProject) throws {
        guard let idx = project.clipTransitions.firstIndex(where: { $0.id == transitionId }) else {
            throw EditCommandError.transitionNotFound(id: transitionId)
        }
        project.clipTransitions[idx] = previous
    }
}
