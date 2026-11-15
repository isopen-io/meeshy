import CoreGraphics
import Foundation

public struct DeleteClipCommand: EditCommand {
    public let id: String
    public let timestamp: Date
    public let clipId: String
    public let kind: TimelineClipKind
    public let snapshotMedia: StoryMediaObject?
    public let snapshotAudio: StoryAudioPlayerObject?
    public let snapshotText: StoryTextObject?
    public let insertionIndex: Int

    public init(id: String = UUID().uuidString,
                timestamp: Date = Date(),
                clipId: String,
                kind: TimelineClipKind,
                snapshotMedia: StoryMediaObject?,
                snapshotAudio: StoryAudioPlayerObject?,
                snapshotText: StoryTextObject?,
                insertionIndex: Int) {
        self.id = id
        self.timestamp = timestamp
        self.clipId = clipId
        self.kind = kind
        self.snapshotMedia = snapshotMedia
        self.snapshotAudio = snapshotAudio
        self.snapshotText = snapshotText
        self.insertionIndex = insertionIndex
    }

    public func apply(to project: inout TimelineProject) throws {
        switch kind {
        case .video, .image:
            guard project.mediaObjects.contains(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            project.mediaObjects.removeAll { $0.id == clipId }
        case .audio:
            guard project.audioPlayerObjects.contains(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            project.audioPlayerObjects.removeAll { $0.id == clipId }
        case .text:
            guard project.textObjects.contains(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            project.textObjects.removeAll { $0.id == clipId }
        case .sticker:
            throw EditCommandError.invalidState(reason: "stickers are removed on the canvas, not the timeline")
        case .place:
            throw EditCommandError.invalidState(reason: "places are removed on the canvas, not the timeline")
        }
    }

    public func revert(from project: inout TimelineProject) throws {
        switch kind {
        case .video, .image:
            guard let snap = snapshotMedia else {
                throw EditCommandError.invalidState(reason: "missing media snapshot")
            }
            let idx = min(insertionIndex, project.mediaObjects.count)
            project.mediaObjects.insert(snap, at: idx)
        case .audio:
            guard let snap = snapshotAudio else {
                throw EditCommandError.invalidState(reason: "missing audio snapshot")
            }
            let idx = min(insertionIndex, project.audioPlayerObjects.count)
            project.audioPlayerObjects.insert(snap, at: idx)
        case .text:
            guard let snap = snapshotText else {
                throw EditCommandError.invalidState(reason: "missing text snapshot")
            }
            let idx = min(insertionIndex, project.textObjects.count)
            project.textObjects.insert(snap, at: idx)
        case .sticker:
            throw EditCommandError.invalidState(reason: "stickers are removed on the canvas, not the timeline")
        case .place:
            throw EditCommandError.invalidState(reason: "places are removed on the canvas, not the timeline")
        }
    }
}
