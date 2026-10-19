import CoreGraphics
import Foundation

public struct SplitClipCommand: EditCommand {
    public let id: String
    public let timestamp: Date
    public let clipId: String
    public let kind: TimelineClipKind
    public let splitAtRelativeTime: Float
    public let leftId: String
    public let rightId: String

    public init(id: String = UUID().uuidString,
                timestamp: Date = Date(),
                clipId: String,
                kind: TimelineClipKind,
                splitAtRelativeTime: Float,
                leftId: String,
                rightId: String) {
        self.id = id
        self.timestamp = timestamp
        self.clipId = clipId
        self.kind = kind
        self.splitAtRelativeTime = splitAtRelativeTime
        self.leftId = leftId
        self.rightId = rightId
    }

    public func apply(to project: inout TimelineProject) throws {
        switch kind {
        case .video, .image:
            guard let idx = project.mediaObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            let original = project.mediaObjects[idx]
            let originalStart = original.startTime ?? 0
            let originalDuration = original.duration ?? 0
            let splitD = Double(splitAtRelativeTime)
            var left = original
            left.id = leftId
            left.duration = splitD
            var right = original
            right.id = rightId
            right.startTime = originalStart + splitD
            right.duration = max(0, originalDuration - splitD)
            project.mediaObjects.replaceSubrange(idx...idx, with: [left, right])
        case .audio:
            guard let idx = project.audioPlayerObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            let original = project.audioPlayerObjects[idx]
            let originalStart = original.startTime ?? 0
            let originalDuration = original.duration ?? 0
            var left = original
            left.id = leftId
            left.duration = splitAtRelativeTime
            var right = original
            right.id = rightId
            right.startTime = originalStart + splitAtRelativeTime
            right.duration = max(0, originalDuration - splitAtRelativeTime)
            project.audioPlayerObjects.replaceSubrange(idx...idx, with: [left, right])
        case .text:
            guard let idx = project.textObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            let original = project.textObjects[idx]
            let originalStart = Float(original.startTime ?? 0)
            let originalDuration = Float(original.duration ?? 0)
            var left = original
            left.id = leftId
            left.duration = Double(splitAtRelativeTime)
            var right = original
            right.id = rightId
            right.startTime = Double(originalStart + splitAtRelativeTime)
            right.duration = Double(max(0, originalDuration - splitAtRelativeTime))
            project.textObjects.replaceSubrange(idx...idx, with: [left, right])
        case .sticker:
            throw EditCommandError.invalidState(reason: "stickers cannot be split on the timeline")
        case .place:
            throw EditCommandError.invalidState(reason: "places cannot be split on the timeline")
        }
    }

    public func revert(from project: inout TimelineProject) throws {
        switch kind {
        case .video, .image:
            guard let leftIdx = project.mediaObjects.firstIndex(where: { $0.id == leftId }),
                  let rightIdx = project.mediaObjects.firstIndex(where: { $0.id == rightId }) else {
                throw EditCommandError.clipNotFound(id: leftId)
            }
            let left = project.mediaObjects[leftIdx]
            let right = project.mediaObjects[rightIdx]
            var restored = left
            restored.id = clipId
            restored.duration = (left.duration ?? 0) + (right.duration ?? 0)
            // La moitié gauche redevient le clip, la droite part — par IDENTITÉ : un clip glissé entre
            // les deux depuis la scission était emporté par un remplacement de plage.
            project.mediaObjects[leftIdx] = restored
            project.mediaObjects.removeAll { $0.id == rightId }
        case .audio:
            guard let leftIdx = project.audioPlayerObjects.firstIndex(where: { $0.id == leftId }),
                  let rightIdx = project.audioPlayerObjects.firstIndex(where: { $0.id == rightId }) else {
                throw EditCommandError.clipNotFound(id: leftId)
            }
            let left = project.audioPlayerObjects[leftIdx]
            let right = project.audioPlayerObjects[rightIdx]
            var restored = left
            restored.id = clipId
            restored.duration = (left.duration ?? 0) + (right.duration ?? 0)
            // La moitié gauche redevient le clip, la droite part — par IDENTITÉ : un clip glissé entre
            // les deux depuis la scission était emporté par un remplacement de plage.
            project.audioPlayerObjects[leftIdx] = restored
            project.audioPlayerObjects.removeAll { $0.id == rightId }
        case .text:
            guard let leftIdx = project.textObjects.firstIndex(where: { $0.id == leftId }),
                  let rightIdx = project.textObjects.firstIndex(where: { $0.id == rightId }) else {
                throw EditCommandError.clipNotFound(id: leftId)
            }
            let left = project.textObjects[leftIdx]
            let right = project.textObjects[rightIdx]
            var restored = left
            restored.id = clipId
            restored.duration = (left.duration ?? 0) + (right.duration ?? 0)
            // La moitié gauche redevient le clip, la droite part — par IDENTITÉ : un clip glissé entre
            // les deux depuis la scission était emporté par un remplacement de plage.
            project.textObjects[leftIdx] = restored
            project.textObjects.removeAll { $0.id == rightId }
        case .sticker:
            throw EditCommandError.invalidState(reason: "stickers cannot be split on the timeline")
        case .place:
            throw EditCommandError.invalidState(reason: "places cannot be split on the timeline")
        }
    }
}
