import CoreGraphics
import Foundation

// Les douze commandes concrètes du pattern Command, extraites de
// `StoryModels.swift` avec leur cible (`StoryTimelineProject.swift`) — voir
// l'en-tête de ce fichier pour le motif.
//
// Déplacement PUR. `private extension TimelineProject` (les aides de
// keyframes) descend AVEC elles : son unique appelant est dans ce fichier,
// vérifié avant l'extraction — un `private` de portée FICHIER qui laisse un
// appelant derrière lui ne se voit qu'à la compilation, et seulement si
// quelqu'un compile.

// MARK: - Edit Commands (12 concrete cases)

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
            let lower = min(leftIdx, rightIdx)
            let upper = max(leftIdx, rightIdx)
            project.mediaObjects.replaceSubrange(lower...upper, with: [restored])
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
            let lower = min(leftIdx, rightIdx)
            let upper = max(leftIdx, rightIdx)
            project.audioPlayerObjects.replaceSubrange(lower...upper, with: [restored])
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
            let lower = min(leftIdx, rightIdx)
            let upper = max(leftIdx, rightIdx)
            project.textObjects.replaceSubrange(lower...upper, with: [restored])
        case .sticker:
            throw EditCommandError.invalidState(reason: "stickers cannot be split on the timeline")
        case .place:
            throw EditCommandError.invalidState(reason: "places cannot be split on the timeline")
        }
    }
}

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

/// Allonge (ou raccourcit) la timeline elle-même — ce que pose « +10 s ».
///
/// La commande porte AUSSI la durée d'auteur d'avant : c'est le champ qui
/// distingue une longueur voulue d'un simple calcul du contenu, et sans lui
/// l'annulation aurait rendu la durée au projet pour se la faire aussitôt
/// reprendre par le premier recalcul venu.
public struct SetSlideDurationCommand: EditCommand {
    public let id: String
    public let timestamp: Date
    public let oldDuration: Float
    public let newDuration: Float
    /// Durée d'auteur d'avant la commande — `nil` quand la longueur dérivait
    /// encore du contenu seul.
    public let oldAuthoredDuration: Float?

    public init(id: String = UUID().uuidString,
                timestamp: Date = Date(),
                oldDuration: Float,
                newDuration: Float,
                oldAuthoredDuration: Float?) {
        self.id = id
        self.timestamp = timestamp
        self.oldDuration = oldDuration
        self.newDuration = newDuration
        self.oldAuthoredDuration = oldAuthoredDuration
    }

    public func apply(to project: inout TimelineProject) throws {
        project.slideDuration = newDuration
    }

    public func revert(from project: inout TimelineProject) throws {
        project.slideDuration = oldDuration
    }
}

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

public struct SetClipPropertyCommand: EditCommand {
    public enum ClipProperty: Codable, Sendable, Equatable {
        case volume(old: Float, new: Float)
        case fadeIn(old: Double?, new: Double?)
        case fadeOut(old: Double?, new: Double?)
        case loop(old: Bool?, new: Bool?)
        case isBackground(old: Bool?, new: Bool?)
        case isLocked(old: Bool?, new: Bool?)
        /// Coupe l'atténuation automatique du clip. Vidéo uniquement : c'est la
        /// piste des vidéos que le ducking atténue.
        case isDuckingDisabled(old: Bool?, new: Bool?)
        case name(old: String?, new: String?)
        /// Place de la piste dans le PLAN — position, taille, rotation, rang de
        /// superposition. Un seul cas plutôt que cinq : régler un champ produit
        /// une transformation COMPLÈTE, donc une seule entrée d'annulation par
        /// réglage, et l'encodage reste à deux clés.
        case transform(old: ClipTransform, new: ClipTransform)

        private enum CodingKeys: String, CodingKey {
            case type, oldFloat, newFloat, oldBool, newBool, oldString, newString
            case oldTransform, newTransform
        }

        private enum Tag: String, Codable {
            case volume, fadeIn, fadeOut, loop, isBackground, isLocked, name, transform
            case isDuckingDisabled
        }

        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            let tag = try c.decode(Tag.self, forKey: .type)
            switch tag {
            case .volume:
                let old = try c.decode(Float.self, forKey: .oldFloat)
                let new = try c.decode(Float.self, forKey: .newFloat)
                self = .volume(old: old, new: new)
            case .fadeIn:
                let old = try c.decodeIfPresent(Double.self, forKey: .oldFloat)
                let new = try c.decodeIfPresent(Double.self, forKey: .newFloat)
                self = .fadeIn(old: old, new: new)
            case .fadeOut:
                let old = try c.decodeIfPresent(Double.self, forKey: .oldFloat)
                let new = try c.decodeIfPresent(Double.self, forKey: .newFloat)
                self = .fadeOut(old: old, new: new)
            case .loop:
                let old = try c.decodeIfPresent(Bool.self, forKey: .oldBool)
                let new = try c.decodeIfPresent(Bool.self, forKey: .newBool)
                self = .loop(old: old, new: new)
            case .isBackground:
                let old = try c.decodeIfPresent(Bool.self, forKey: .oldBool)
                let new = try c.decodeIfPresent(Bool.self, forKey: .newBool)
                self = .isBackground(old: old, new: new)
            case .isLocked:
                let old = try c.decodeIfPresent(Bool.self, forKey: .oldBool)
                let new = try c.decodeIfPresent(Bool.self, forKey: .newBool)
                self = .isLocked(old: old, new: new)
            case .isDuckingDisabled:
                let old = try c.decodeIfPresent(Bool.self, forKey: .oldBool)
                let new = try c.decodeIfPresent(Bool.self, forKey: .newBool)
                self = .isDuckingDisabled(old: old, new: new)
            case .name:
                let old = try c.decodeIfPresent(String.self, forKey: .oldString)
                let new = try c.decodeIfPresent(String.self, forKey: .newString)
                self = .name(old: old, new: new)
            case .transform:
                let old = try c.decode(ClipTransform.self, forKey: .oldTransform)
                let new = try c.decode(ClipTransform.self, forKey: .newTransform)
                self = .transform(old: old, new: new)
            }
        }

        public func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            switch self {
            case .volume(let old, let new):
                try c.encode(Tag.volume, forKey: .type)
                try c.encode(old, forKey: .oldFloat)
                try c.encode(new, forKey: .newFloat)
            case .fadeIn(let old, let new):
                try c.encode(Tag.fadeIn, forKey: .type)
                try c.encodeIfPresent(old, forKey: .oldFloat)
                try c.encodeIfPresent(new, forKey: .newFloat)
            case .fadeOut(let old, let new):
                try c.encode(Tag.fadeOut, forKey: .type)
                try c.encodeIfPresent(old, forKey: .oldFloat)
                try c.encodeIfPresent(new, forKey: .newFloat)
            case .loop(let old, let new):
                try c.encode(Tag.loop, forKey: .type)
                try c.encodeIfPresent(old, forKey: .oldBool)
                try c.encodeIfPresent(new, forKey: .newBool)
            case .isBackground(let old, let new):
                try c.encode(Tag.isBackground, forKey: .type)
                try c.encodeIfPresent(old, forKey: .oldBool)
                try c.encodeIfPresent(new, forKey: .newBool)
            case .isLocked(let old, let new):
                try c.encode(Tag.isLocked, forKey: .type)
                try c.encodeIfPresent(old, forKey: .oldBool)
                try c.encodeIfPresent(new, forKey: .newBool)
            case .isDuckingDisabled(let old, let new):
                try c.encode(Tag.isDuckingDisabled, forKey: .type)
                try c.encodeIfPresent(old, forKey: .oldBool)
                try c.encodeIfPresent(new, forKey: .newBool)
            case .name(let old, let new):
                try c.encode(Tag.name, forKey: .type)
                try c.encodeIfPresent(old, forKey: .oldString)
                try c.encodeIfPresent(new, forKey: .newString)
            case .transform(let old, let new):
                try c.encode(Tag.transform, forKey: .type)
                try c.encode(old, forKey: .oldTransform)
                try c.encode(new, forKey: .newTransform)
            }
        }
    }

    public let id: String
    public let timestamp: Date
    public let clipId: String
    public let kind: TimelineClipKind
    public let property: ClipProperty

    public init(id: String = UUID().uuidString,
                timestamp: Date = Date(),
                clipId: String,
                kind: TimelineClipKind,
                property: ClipProperty) {
        self.id = id
        self.timestamp = timestamp
        self.clipId = clipId
        self.kind = kind
        self.property = property
    }

    public func apply(to project: inout TimelineProject) throws {
        try mutate(project: &project, useNew: true)
    }

    public func revert(from project: inout TimelineProject) throws {
        try mutate(project: &project, useNew: false)
    }

    private func mutate(project: inout TimelineProject, useNew: Bool) throws {
        switch kind {
        case .video, .image:
            guard let idx = project.mediaObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            apply(property: property, to: &project.mediaObjects[idx], useNew: useNew)
        case .audio:
            guard let idx = project.audioPlayerObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            apply(property: property, to: &project.audioPlayerObjects[idx], useNew: useNew)
        case .text:
            guard let idx = project.textObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            apply(property: property, to: &project.textObjects[idx], useNew: useNew)
        case .sticker:
            throw EditCommandError.invalidState(reason: "sticker properties are edited on the canvas, not the timeline")
        case .place:
            throw EditCommandError.invalidState(reason: "place properties are edited on the canvas, not the timeline")
        }
    }

    private func apply(property: ClipProperty,
                       to media: inout StoryMediaObject,
                       useNew: Bool) {
        switch property {
        case .volume(let old, let new):
            // Via le mémento : muter depuis la timeline (new == 0) mémorise le
            // niveau courant, et l'undo/redo garde l'invariant
            // `memento != nil ⟹ volume == 0` — sans quoi un unmute post-undo
            // restaurerait un niveau périmé.
            media.setVolumePreservingMuteMemento(useNew ? new : old)
        case .fadeIn(let old, let new):
            media.fadeIn = useNew ? new : old
        case .fadeOut(let old, let new):
            media.fadeOut = useNew ? new : old
        case .loop(let old, let new):
            media.loop = (useNew ? new : old) ?? false
        case .isBackground(let old, let new):
            media.isBackground = (useNew ? new : old) ?? false
        case .isLocked:
            break
        case .isDuckingDisabled(let old, let new):
            media.isDuckingDisabled = useNew ? new : old
        case .name(let old, let new):
            media.name = useNew ? new : old
        case .transform(let old, let new):
            let t = useNew ? new : old
            media.x = t.x; media.y = t.y
            media.scale = t.scale; media.rotation = t.rotation
            media.zIndex = t.zIndex
        }
    }

    private func apply(property: ClipProperty,
                       to audio: inout StoryAudioPlayerObject,
                       useNew: Bool) {
        switch property {
        case .volume(let old, let new):
            // Même invariant de mémento que la branche média — cf. ci-dessus.
            audio.setVolumePreservingMuteMemento(useNew ? new : old)
        case .fadeIn(let old, let new):
            let val: Double? = useNew ? new : old
            audio.fadeIn = val.map { Float($0) }
        case .fadeOut(let old, let new):
            let val: Double? = useNew ? new : old
            audio.fadeOut = val.map { Float($0) }
        case .loop(let old, let new):
            audio.loop = useNew ? new : old
        case .isBackground(let old, let new):
            audio.isBackground = useNew ? new : old
        case .isLocked:
            break
        case .isDuckingDisabled:
            // Le ducking atténue la piste des VIDÉOS pour dégager la musique :
            // le couper sur un audio n'aurait rien à atténuer.
            break
        case .name(let old, let new):
            audio.name = useNew ? new : old
        case .transform:
            // Un audio ne se voit pas : ses x/y existent dans le modèle mais ne
            // pilotent aucun rendu. La fiche ne propose pas la section.
            break
        }
    }

    private func apply(property: ClipProperty,
                       to text: inout StoryTextObject,
                       useNew: Bool) {
        switch property {
        case .isLocked(let old, let new):
            text.isLocked = useNew ? new : old
        case .fadeIn(let old, let new):
            let val: Double? = useNew ? new : old
            text.fadeIn = val
        case .fadeOut(let old, let new):
            let val: Double? = useNew ? new : old
            text.fadeOut = val
        case .name(let old, let new):
            text.name = useNew ? new : old
        case .transform(let old, let new):
            let tr = useNew ? new : old
            text.x = tr.x; text.y = tr.y
            text.scale = tr.scale; text.rotation = tr.rotation
            text.zIndex = tr.zIndex
        case .volume, .loop, .isBackground, .isDuckingDisabled:
            break
        }
    }
}

