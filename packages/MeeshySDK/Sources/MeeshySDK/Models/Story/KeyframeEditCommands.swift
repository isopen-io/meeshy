import CoreGraphics
import Foundation

// MARK: - Keyframe array helpers (private to this file)

private extension TimelineProject {
    /// Normalises the keyframes array on a clip so that "no keyframes" is
    /// always represented as `nil` (not `[]`). This canonical form lets
    /// `apply -> revert` produce a project byte-equal to the pre-apply state
    /// even when the original clip had `keyframes == nil` and a single add
    /// would otherwise leave it as `[]` after removal.
    mutating func mutateKeyframes(clipId: String,
                                  kind: TimelineClipKind,
                                  block: (inout [StoryKeyframe]) throws -> Void) throws {
        switch kind {
        case .video, .image:
            guard let idx = mediaObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            var arr = mediaObjects[idx].keyframes ?? []
            try block(&arr)
            mediaObjects[idx].keyframes = arr.isEmpty ? nil : arr
        case .text:
            guard let idx = textObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            var arr = textObjects[idx].keyframes ?? []
            try block(&arr)
            textObjects[idx].keyframes = arr.isEmpty ? nil : arr
        case .audio:
            // Les clips audio portent désormais des keyframes — le canal
            // `volume` y pilote l'automation sonore. Refuser ici rendait toute
            // automation impossible sur un son, alors que le média l'avait.
            guard let idx = audioPlayerObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            var arr = audioPlayerObjects[idx].keyframes ?? []
            try block(&arr)
            audioPlayerObjects[idx].keyframes = arr.isEmpty ? nil : arr
        case .sticker:
            throw EditCommandError.invalidState(reason: "sticker clips do not support keyframes")
        case .place:
            throw EditCommandError.invalidState(reason: "place clips do not support keyframes")
        }
    }
}

public struct AddKeyframeCommand: EditCommand {
    public let id: String
    public let timestamp: Date
    public let clipId: String
    public let kind: TimelineClipKind
    public let keyframe: StoryKeyframe

    public init(id: String = UUID().uuidString,
                timestamp: Date = Date(),
                clipId: String,
                kind: TimelineClipKind,
                keyframe: StoryKeyframe) {
        self.id = id
        self.timestamp = timestamp
        self.clipId = clipId
        self.kind = kind
        self.keyframe = keyframe
    }

    public func apply(to project: inout TimelineProject) throws {
        try project.mutateKeyframes(clipId: clipId, kind: kind) { arr in
            arr.append(keyframe)
        }
    }

    public func revert(from project: inout TimelineProject) throws {
        try project.mutateKeyframes(clipId: clipId, kind: kind) { arr in
            arr.removeAll { $0.id == keyframe.id }
        }
    }
}

public struct MoveKeyframeCommand: EditCommand {
    public let id: String
    public let timestamp: Date
    public let clipId: String
    public let kind: TimelineClipKind
    public let keyframeId: String
    // Time delta — always-encoded, drives the "scrub a keyframe along the
    // timeline" gesture. Other deltas below are optional (nil = no change)
    // and let the same command type carry KeyframeInspector edits
    // (position / scale / opacity / easing) without exploding the
    // AnyEditCommand enum.
    public let oldTime: Float
    public let newTime: Float
    // Optional transform deltas — `nil` means "no change on this axis".
    // Decoded via `decodeIfPresent` so legacy time-only snapshots persisted
    // before this extension still round-trip cleanly.
    public let oldX: CGFloat?
    public let newX: CGFloat?
    public let oldY: CGFloat?
    public let newY: CGFloat?
    public let oldScale: CGFloat?
    public let newScale: CGFloat?
    public let oldOpacity: CGFloat?
    public let newOpacity: CGFloat?
    public let oldEasing: StoryEasing?
    public let newEasing: StoryEasing?

    public init(id: String = UUID().uuidString,
                timestamp: Date = Date(),
                clipId: String,
                kind: TimelineClipKind,
                keyframeId: String,
                oldTime: Float,
                newTime: Float,
                oldX: CGFloat? = nil, newX: CGFloat? = nil,
                oldY: CGFloat? = nil, newY: CGFloat? = nil,
                oldScale: CGFloat? = nil, newScale: CGFloat? = nil,
                oldOpacity: CGFloat? = nil, newOpacity: CGFloat? = nil,
                oldEasing: StoryEasing? = nil, newEasing: StoryEasing? = nil) {
        self.id = id
        self.timestamp = timestamp
        self.clipId = clipId
        self.kind = kind
        self.keyframeId = keyframeId
        self.oldTime = oldTime
        self.newTime = newTime
        self.oldX = oldX; self.newX = newX
        self.oldY = oldY; self.newY = newY
        self.oldScale = oldScale; self.newScale = newScale
        self.oldOpacity = oldOpacity; self.newOpacity = newOpacity
        self.oldEasing = oldEasing; self.newEasing = newEasing
    }

    private enum CodingKeys: String, CodingKey {
        case id, timestamp, clipId, kind, keyframeId
        case oldTime, newTime
        case oldX, newX, oldY, newY
        case oldScale, newScale
        case oldOpacity, newOpacity
        case oldEasing, newEasing
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try c.decode(String.self, forKey: .id)
        self.timestamp = try c.decode(Date.self, forKey: .timestamp)
        self.clipId = try c.decode(String.self, forKey: .clipId)
        self.kind = try c.decode(TimelineClipKind.self, forKey: .kind)
        self.keyframeId = try c.decode(String.self, forKey: .keyframeId)
        self.oldTime = try c.decode(Float.self, forKey: .oldTime)
        self.newTime = try c.decode(Float.self, forKey: .newTime)
        self.oldX = try c.decodeIfPresent(CGFloat.self, forKey: .oldX)
        self.newX = try c.decodeIfPresent(CGFloat.self, forKey: .newX)
        self.oldY = try c.decodeIfPresent(CGFloat.self, forKey: .oldY)
        self.newY = try c.decodeIfPresent(CGFloat.self, forKey: .newY)
        self.oldScale = try c.decodeIfPresent(CGFloat.self, forKey: .oldScale)
        self.newScale = try c.decodeIfPresent(CGFloat.self, forKey: .newScale)
        self.oldOpacity = try c.decodeIfPresent(CGFloat.self, forKey: .oldOpacity)
        self.newOpacity = try c.decodeIfPresent(CGFloat.self, forKey: .newOpacity)
        self.oldEasing = try c.decodeIfPresent(StoryEasing.self, forKey: .oldEasing)
        self.newEasing = try c.decodeIfPresent(StoryEasing.self, forKey: .newEasing)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(timestamp, forKey: .timestamp)
        try c.encode(clipId, forKey: .clipId)
        try c.encode(kind, forKey: .kind)
        try c.encode(keyframeId, forKey: .keyframeId)
        try c.encode(oldTime, forKey: .oldTime)
        try c.encode(newTime, forKey: .newTime)
        try c.encodeIfPresent(oldX, forKey: .oldX)
        try c.encodeIfPresent(newX, forKey: .newX)
        try c.encodeIfPresent(oldY, forKey: .oldY)
        try c.encodeIfPresent(newY, forKey: .newY)
        try c.encodeIfPresent(oldScale, forKey: .oldScale)
        try c.encodeIfPresent(newScale, forKey: .newScale)
        try c.encodeIfPresent(oldOpacity, forKey: .oldOpacity)
        try c.encodeIfPresent(newOpacity, forKey: .newOpacity)
        try c.encodeIfPresent(oldEasing, forKey: .oldEasing)
        try c.encodeIfPresent(newEasing, forKey: .newEasing)
    }

    public func apply(to project: inout TimelineProject) throws {
        try mutate(project: &project, direction: .forward)
    }

    public func revert(from project: inout TimelineProject) throws {
        try mutate(project: &project, direction: .backward)
    }

    private enum Direction { case forward, backward }

    private func mutate(project: inout TimelineProject, direction: Direction) throws {
        try project.mutateKeyframes(clipId: clipId, kind: kind) { arr in
            guard let idx = arr.firstIndex(where: { $0.id == keyframeId }) else {
                throw EditCommandError.keyframeNotFound(id: keyframeId)
            }
            // Time is always tracked (legacy field). Other deltas only mutate
            // when both sides of the pair are non-nil, so a "scale-only" edit
            // doesn't accidentally clear x/y/opacity.
            arr[idx].time = (direction == .forward) ? newTime : oldTime
            if let nx = newX, let ox = oldX { arr[idx].x = (direction == .forward) ? nx : ox }
            if let ny = newY, let oy = oldY { arr[idx].y = (direction == .forward) ? ny : oy }
            if let ns = newScale, let os = oldScale {
                arr[idx].scale = (direction == .forward) ? ns : os
            }
            if let no = newOpacity, let oo = oldOpacity {
                arr[idx].opacity = (direction == .forward) ? no : oo
            }
            if let ne = newEasing, let oe = oldEasing {
                arr[idx].easing = (direction == .forward) ? ne : oe
            }
        }
    }
}

public struct DeleteKeyframeCommand: EditCommand {
    public let id: String
    public let timestamp: Date
    public let clipId: String
    public let kind: TimelineClipKind
    public let keyframeId: String
    public let snapshot: StoryKeyframe
    public let insertionIndex: Int

    public init(id: String = UUID().uuidString,
                timestamp: Date = Date(),
                clipId: String,
                kind: TimelineClipKind,
                keyframeId: String,
                snapshot: StoryKeyframe,
                insertionIndex: Int) {
        self.id = id
        self.timestamp = timestamp
        self.clipId = clipId
        self.kind = kind
        self.keyframeId = keyframeId
        self.snapshot = snapshot
        self.insertionIndex = insertionIndex
    }

    public func apply(to project: inout TimelineProject) throws {
        try project.mutateKeyframes(clipId: clipId, kind: kind) { arr in
            guard arr.contains(where: { $0.id == keyframeId }) else {
                throw EditCommandError.keyframeNotFound(id: keyframeId)
            }
            arr.removeAll { $0.id == keyframeId }
        }
    }

    public func revert(from project: inout TimelineProject) throws {
        try project.mutateKeyframes(clipId: clipId, kind: kind) { arr in
            let idx = min(insertionIndex, arr.count)
            arr.insert(snapshot, at: idx)
        }
    }
}
