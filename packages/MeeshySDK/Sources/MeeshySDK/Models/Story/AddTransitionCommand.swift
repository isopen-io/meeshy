import CoreGraphics
import Foundation

public struct AddTransitionCommand: EditCommand {
    public let id: String
    public let timestamp: Date
    public let transition: StoryClipTransition

    public init(id: String = UUID().uuidString,
                timestamp: Date = Date(),
                transition: StoryClipTransition) {
        self.id = id
        self.timestamp = timestamp
        self.transition = transition
    }

    public func apply(to project: inout TimelineProject) throws {
        project.clipTransitions.append(transition)
    }

    public func revert(from project: inout TimelineProject) throws {
        project.clipTransitions.removeAll { $0.id == transition.id }
    }
}
