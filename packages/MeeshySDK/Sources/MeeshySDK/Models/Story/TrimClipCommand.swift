import CoreGraphics
import Foundation

public struct TrimClipCommand: EditCommand {
    public let id: String
    public let timestamp: Date
    public let clipId: String
    public let kind: TimelineClipKind
    public let oldStartTime: Float
    public let oldDuration: Float
    public let newStartTime: Float
    public let newDuration: Float

    public init(id: String = UUID().uuidString,
                timestamp: Date = Date(),
                clipId: String,
                kind: TimelineClipKind,
                oldStartTime: Float,
                oldDuration: Float,
                newStartTime: Float,
                newDuration: Float) {
        self.id = id
        self.timestamp = timestamp
        self.clipId = clipId
        self.kind = kind
        self.oldStartTime = oldStartTime
        self.oldDuration = oldDuration
        self.newStartTime = newStartTime
        self.newDuration = newDuration
    }

    public func apply(to project: inout TimelineProject) throws {
        try mutate(project: &project, startTime: newStartTime, duration: newDuration)
    }

    public func revert(from project: inout TimelineProject) throws {
        try mutate(project: &project, startTime: oldStartTime, duration: oldDuration)
    }

    private func mutate(project: inout TimelineProject,
                        startTime: Float, duration: Float) throws {
        switch kind {
        case .video, .image:
            guard let idx = project.mediaObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            project.mediaObjects[idx].startTime = Double(startTime)
            project.mediaObjects[idx].duration = Double(duration)
        case .audio:
            guard let idx = project.audioPlayerObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            project.audioPlayerObjects[idx].startTime = startTime
            project.audioPlayerObjects[idx].duration = duration
        case .text:
            guard let idx = project.textObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            project.textObjects[idx].startTime = Double(startTime)
            project.textObjects[idx].duration = Double(duration)
        case .sticker:
            guard let idx = project.stickerObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            project.stickerObjects[idx].startTime = Double(startTime)
            project.stickerObjects[idx].duration = Double(duration)
        case .place:
            guard let idx = project.locationObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            project.locationObjects[idx].startTime = Double(startTime)
            project.locationObjects[idx].duration = Double(duration)
        }
    }
}
