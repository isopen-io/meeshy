import CoreGraphics
import Foundation

public struct AddClipCommand: EditCommand {
    public let id: String
    public let timestamp: Date
    public let clipId: String
    public let postMediaId: String
    public let kind: TimelineClipKind
    public let startTime: Float
    public let duration: Float
    public let content: String?
    /// Width / height ratio of the source asset, captured by the caller when
    /// the clip is added (image / video). Frozen into the resulting
    /// `StoryMediaObject` so the canvas can letterbox correctly without
    /// re-resolving the asset. Defaults to `1.0` for callers that don't yet
    /// know the dimensions (and for legacy drafts decoded without this field).
    public let aspectRatio: Double

    public init(id: String = UUID().uuidString,
                timestamp: Date = Date(),
                clipId: String,
                postMediaId: String,
                kind: TimelineClipKind,
                startTime: Float,
                duration: Float,
                content: String? = nil,
                aspectRatio: Double = 1.0) {
        self.id = id
        self.timestamp = timestamp
        self.clipId = clipId
        self.postMediaId = postMediaId
        self.kind = kind
        self.startTime = startTime
        self.duration = duration
        self.content = content
        self.aspectRatio = aspectRatio
    }

    private enum CodingKeys: String, CodingKey {
        case id, timestamp, clipId, postMediaId, kind, startTime, duration, content, aspectRatio
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        timestamp = try c.decode(Date.self, forKey: .timestamp)
        clipId = try c.decode(String.self, forKey: .clipId)
        postMediaId = try c.decode(String.self, forKey: .postMediaId)
        kind = try c.decode(TimelineClipKind.self, forKey: .kind)
        startTime = try c.decode(Float.self, forKey: .startTime)
        duration = try c.decode(Float.self, forKey: .duration)
        content = try c.decodeIfPresent(String.self, forKey: .content)
        // REQUIRED conceptually but falls back to 1.0 for legacy drafts
        // persisted before this field existed (mirrors StoryMediaObject).
        aspectRatio = try c.decodeIfPresent(Double.self, forKey: .aspectRatio) ?? 1.0
    }

    public func apply(to project: inout TimelineProject) throws {
        switch kind {
        case .video, .image:
            let mediaType = kind == .video ? "video" : "image"
            project.mediaObjects.append(
                StoryMediaObject(id: clipId, postMediaId: postMediaId,
                                 mediaType: mediaType, placement: "media",
                                 aspectRatio: aspectRatio,
                                 startTime: Double(startTime), duration: Double(duration))
            )
        case .audio:
            project.audioPlayerObjects.append(
                StoryAudioPlayerObject(id: clipId, postMediaId: postMediaId,
                                       placement: "overlay",
                                       waveformSamples: [],
                                       startTime: startTime, duration: duration)
            )
        case .text:
            project.textObjects.append(
                StoryTextObject(id: clipId, text: content ?? "",
                                startTime: Double(startTime),
                                duration: Double(duration))
            )
        case .sticker:
            // Les stickers sont ajoutés via le picker du canvas, jamais depuis la
            // timeline — cette commande n'est donc jamais construite avec `.sticker`.
            throw EditCommandError.invalidState(reason: "stickers are added on the canvas, not the timeline")
        case .place:
            throw EditCommandError.invalidState(reason: "places are added on the canvas, not the timeline")
        }
    }

    public func revert(from project: inout TimelineProject) throws {
        switch kind {
        case .video, .image:
            project.mediaObjects.removeAll { $0.id == clipId }
        case .audio:
            project.audioPlayerObjects.removeAll { $0.id == clipId }
        case .text:
            project.textObjects.removeAll { $0.id == clipId }
        case .sticker:
            throw EditCommandError.invalidState(reason: "stickers are added on the canvas, not the timeline")
        case .place:
            throw EditCommandError.invalidState(reason: "places are added on the canvas, not the timeline")
        }
    }
}
