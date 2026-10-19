import CoreGraphics
import Foundation

public struct MoveClipCommand: EditCommand {
    public let id: String
    public let timestamp: Date
    public let clipId: String
    public let kind: TimelineClipKind
    public let oldStartTime: Float
    public let newStartTime: Float

    public init(id: String = UUID().uuidString,
                timestamp: Date = Date(),
                clipId: String,
                kind: TimelineClipKind,
                oldStartTime: Float,
                newStartTime: Float) {
        self.id = id
        self.timestamp = timestamp
        self.clipId = clipId
        self.kind = kind
        self.oldStartTime = oldStartTime
        self.newStartTime = newStartTime
    }

    public func apply(to project: inout TimelineProject) throws {
        try mutate(project: &project, startTime: newStartTime)
    }

    public func revert(from project: inout TimelineProject) throws {
        try mutate(project: &project, startTime: oldStartTime)
    }

    private func mutate(project: inout TimelineProject, startTime: Float) throws {
        switch kind {
        case .video, .image:
            guard let idx = project.mediaObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            project.mediaObjects[idx].startTime = Double(startTime)
        case .audio:
            guard let idx = project.audioPlayerObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            project.audioPlayerObjects[idx].startTime = startTime
        case .text:
            guard let idx = project.textObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            project.textObjects[idx].startTime = Double(startTime)
        case .sticker:
            guard let idx = project.stickerObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            project.stickerObjects[idx].startTime = Double(startTime)
        case .place:
            guard let idx = project.locationObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            project.locationObjects[idx].startTime = Double(startTime)
        }
    }
}
