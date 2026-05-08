import Foundation
import UIKit
import MeeshySDK

// MARK: - Plan 4 helper additions to TimelineViewModel
// Split out to keep TimelineViewModel.swift under 400 lines.

extension TimelineViewModel {

    // MARK: - Command history depth (test + UI badge)

    /// Number of commands currently on the stack (both applied and undoable).
    public var commandHistoryDepth: Int { commandStack.count }

    // MARK: - Drag convenience alias

    /// Convenience wrapper: begin + move (+ optional commit) in one call.
    /// Maps to the begin/dragClipMoved/endClipDrag API.
    public func dragClip(id: String, deltaTimeSeconds: Float, isCommitted: Bool) {
        beginClipDrag(clipId: id)
        let originalStart = clipStartTime(id: id) ?? 0
        dragClipMoved(rawTime: originalStart + deltaTimeSeconds, snapCandidates: [])
        if isCommitted { endClipDrag() }
    }

    // MARK: - Trim helpers

    /// Trim the start handle of a clip by `deltaTimeSeconds` (positive = shrink from left).
    /// Pushes a `TrimClipCommand` onto the stack.
    public func trimClipStart(id: String, deltaTimeSeconds: Float) {
        guard deltaTimeSeconds.isFinite else { return }
        guard let kind = clipKind(forId: id),
              let currentStart = clipStartTime(id: id),
              let currentDuration = clipDuration(id: id) else { return }
        let newStart = max(0, currentStart + deltaTimeSeconds)
        let actualDelta = newStart - currentStart
        let newDuration = max(0.05, currentDuration - actualDelta)
        let cmd = TrimClipCommand(
            clipId: id, kind: kind,
            oldStartTime: currentStart, oldDuration: currentDuration,
            newStartTime: newStart, newDuration: newDuration
        )
        do {
            try cmd.apply(to: &project)
            commandStack.push(.trimClip(cmd))
            scheduleEngineReconfigure()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Trim the end handle of a clip by `deltaTimeSeconds` (positive = extend right).
    /// Clamps to `mediaDurationLimit` when provided (source media length).
    public func trimClipEnd(id: String, deltaTimeSeconds: Float, mediaDurationLimit: Float? = nil) {
        guard let kind = clipKind(forId: id),
              let currentStart = clipStartTime(id: id),
              let currentDuration = clipDuration(id: id) else { return }
        var newDuration = max(0.05, currentDuration + deltaTimeSeconds)
        if let limit = mediaDurationLimit {
            newDuration = min(newDuration, limit)
        }
        let cmd = TrimClipCommand(
            clipId: id, kind: kind,
            oldStartTime: currentStart, oldDuration: currentDuration,
            newStartTime: currentStart, newDuration: newDuration
        )
        do {
            try cmd.apply(to: &project)
            commandStack.push(.trimClip(cmd))
            scheduleEngineReconfigure()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Add media / audio helpers

    /// Append a video or image clip to the project.
    public func addMedia(id: String, postMediaId: String, kind: StoryMediaKind,
                         startTime: Float = 0, duration: Float = 5) {
        let cmd = AddClipCommand(clipId: id, postMediaId: postMediaId,
                                 kind: kind == .video ? .video : .image,
                                 startTime: startTime, duration: duration)
        do {
            try cmd.apply(to: &project)
            commandStack.push(.addClip(cmd))
            scheduleEngineReconfigure()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Append an audio clip to the project.
    public func addAudio(id: String, postMediaId: String,
                         startTime: Float = 0, duration: Float = 5) {
        let cmd = AddClipCommand(clipId: id, postMediaId: postMediaId,
                                 kind: .audio, startTime: startTime, duration: duration)
        do {
            try cmd.apply(to: &project)
            commandStack.push(.addClip(cmd))
            scheduleEngineReconfigure()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Extend clip (overlap / transition helper)

    /// Extend a clip toward the next clip by `overlapSeconds`. If negative, it shrinks.
    /// Wraps `trimClipEnd` with a semantic name used by transition drag creation.
    public func didExtendClip(id: String, overlapWithNextSeconds: Float) {
        trimClipEnd(id: id, deltaTimeSeconds: overlapWithNextSeconds)
    }

    // MARK: - Snap disabled toggle (two-finger drag override)

    /// Programmatically disable or enable snap — used when a two-finger drag
    /// signals the user wants free positioning without snapping.
    public func setSnapDisabled(_ disabled: Bool) {
        isSnapEnabled = !disabled
    }

    // MARK: - Internal clip dimension helper (accessible to extension)

    func clipDuration(id: String) -> Float? {
        if let m = project.mediaObjects.first(where: { $0.id == id }) { return m.duration }
        if let a = project.audioPlayerObjects.first(where: { $0.id == id }) { return a.duration }
        if let t = project.textObjects.first(where: { $0.id == id }) { return t.duration.map { Float($0) } }
        return nil
    }

    // MARK: - Clip property mutations (used by ClipInspector callbacks)

    public func setClipVolume(id: String, volume: Float) {
        guard let kind = clipKind(forId: id) else { return }
        let oldVolume: Float
        switch kind {
        case .video, .image:
            oldVolume = project.mediaObjects.first(where: { $0.id == id })?.volume ?? 1.0
        case .audio:
            oldVolume = project.audioPlayerObjects.first(where: { $0.id == id })?.volume ?? 1.0
        case .text:
            return
        }
        let cmd = SetClipPropertyCommand(clipId: id, kind: kind,
                                         property: .volume(old: oldVolume, new: volume))
        applySetClipProperty(cmd)
    }

    public func setClipFadeIn(id: String, fadeIn: Float) {
        guard let kind = clipKind(forId: id) else { return }
        let oldFadeIn: Float?
        switch kind {
        case .video, .image:
            oldFadeIn = project.mediaObjects.first(where: { $0.id == id })?.fadeIn
        case .audio:
            oldFadeIn = project.audioPlayerObjects.first(where: { $0.id == id })?.fadeIn
        case .text:
            oldFadeIn = project.textObjects.first(where: { $0.id == id })?.fadeIn.map { Float($0) }
        }
        let cmd = SetClipPropertyCommand(clipId: id, kind: kind,
                                         property: .fadeIn(old: oldFadeIn, new: fadeIn))
        applySetClipProperty(cmd)
    }

    public func setClipFadeOut(id: String, fadeOut: Float) {
        guard let kind = clipKind(forId: id) else { return }
        let oldFadeOut: Float?
        switch kind {
        case .video, .image:
            oldFadeOut = project.mediaObjects.first(where: { $0.id == id })?.fadeOut
        case .audio:
            oldFadeOut = project.audioPlayerObjects.first(where: { $0.id == id })?.fadeOut
        case .text:
            oldFadeOut = project.textObjects.first(where: { $0.id == id })?.fadeOut.map { Float($0) }
        }
        let cmd = SetClipPropertyCommand(clipId: id, kind: kind,
                                         property: .fadeOut(old: oldFadeOut, new: fadeOut))
        applySetClipProperty(cmd)
    }

    public func setClipLoop(id: String, isLooping: Bool) {
        guard let kind = clipKind(forId: id) else { return }
        let oldLoop: Bool?
        switch kind {
        case .video, .image:
            oldLoop = project.mediaObjects.first(where: { $0.id == id })?.loop
        case .audio:
            oldLoop = project.audioPlayerObjects.first(where: { $0.id == id })?.loop
        case .text:
            return
        }
        let cmd = SetClipPropertyCommand(clipId: id, kind: kind,
                                         property: .loop(old: oldLoop, new: isLooping))
        applySetClipProperty(cmd)
    }

    public func setClipBackground(id: String, isBackground: Bool) {
        guard let kind = clipKind(forId: id) else { return }
        let oldBg: Bool?
        switch kind {
        case .video, .image:
            oldBg = project.mediaObjects.first(where: { $0.id == id })?.isBackground
        case .audio:
            oldBg = project.audioPlayerObjects.first(where: { $0.id == id })?.isBackground
        case .text:
            return
        }
        let cmd = SetClipPropertyCommand(clipId: id, kind: kind,
                                         property: .isBackground(old: oldBg, new: isBackground))
        applySetClipProperty(cmd)
    }

    private func applySetClipProperty(_ cmd: SetClipPropertyCommand) {
        do {
            try cmd.apply(to: &project)
            commandStack.push(.setClipProperty(cmd))
            scheduleEngineReconfigure()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Clip deletion

    public func deleteClip(id: String) {
        guard let kind = clipKind(forId: id) else { return }
        let snapshotMedia: StoryMediaObject?
        let snapshotAudio: StoryAudioPlayerObject?
        let snapshotText: StoryTextObject?
        let insertionIndex: Int
        switch kind {
        case .video, .image:
            snapshotMedia = project.mediaObjects.first(where: { $0.id == id })
            snapshotAudio = nil
            snapshotText = nil
            insertionIndex = project.mediaObjects.firstIndex(where: { $0.id == id }) ?? 0
        case .audio:
            snapshotMedia = nil
            snapshotAudio = project.audioPlayerObjects.first(where: { $0.id == id })
            snapshotText = nil
            insertionIndex = project.audioPlayerObjects.firstIndex(where: { $0.id == id }) ?? 0
        case .text:
            snapshotMedia = nil
            snapshotAudio = nil
            snapshotText = project.textObjects.first(where: { $0.id == id })
            insertionIndex = project.textObjects.firstIndex(where: { $0.id == id }) ?? 0
        }
        let cmd = DeleteClipCommand(clipId: id, kind: kind,
                                    snapshotMedia: snapshotMedia,
                                    snapshotAudio: snapshotAudio,
                                    snapshotText: snapshotText,
                                    insertionIndex: insertionIndex)
        do {
            try cmd.apply(to: &project)
            commandStack.push(.deleteClip(cmd))
            if selection.selectedClipId == id { selection.deselect() }
            scheduleEngineReconfigure()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Keyframe mutations

    public func moveKeyframe(clipId: String, keyframeId: String, newTime: Float) {
        guard let kind = clipKind(forId: clipId) else { return }
        let oldTime: Float
        switch kind {
        case .video, .image:
            guard let kf = project.mediaObjects.first(where: { $0.id == clipId })?
                .keyframes?.first(where: { $0.id == keyframeId }) else { return }
            oldTime = kf.time
        case .text:
            guard let kf = project.textObjects.first(where: { $0.id == clipId })?
                .keyframes?.first(where: { $0.id == keyframeId }) else { return }
            oldTime = kf.time
        case .audio:
            return
        }
        let cmd = MoveKeyframeCommand(clipId: clipId, kind: kind,
                                      keyframeId: keyframeId, oldTime: oldTime, newTime: newTime)
        do {
            try cmd.apply(to: &project)
            commandStack.push(.moveKeyframe(cmd))
            scheduleEngineReconfigure()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    public func deleteKeyframe(clipId: String, keyframeId: String) {
        guard let kind = clipKind(forId: clipId) else { return }
        let snapshot: StoryKeyframe
        let insertionIndex: Int
        switch kind {
        case .video, .image:
            let keyframes = project.mediaObjects.first(where: { $0.id == clipId })?.keyframes ?? []
            guard let idx = keyframes.firstIndex(where: { $0.id == keyframeId }) else { return }
            snapshot = keyframes[idx]
            insertionIndex = idx
        case .text:
            let keyframes = project.textObjects.first(where: { $0.id == clipId })?.keyframes ?? []
            guard let idx = keyframes.firstIndex(where: { $0.id == keyframeId }) else { return }
            snapshot = keyframes[idx]
            insertionIndex = idx
        case .audio:
            return
        }
        let cmd = DeleteKeyframeCommand(clipId: clipId, kind: kind,
                                        keyframeId: keyframeId,
                                        snapshot: snapshot,
                                        insertionIndex: insertionIndex)
        do {
            try cmd.apply(to: &project)
            commandStack.push(.deleteKeyframe(cmd))
            scheduleEngineReconfigure()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Transition mutations

    public func changeTransition(transitionId: String, kind: StoryTransitionKind, duration: Float) {
        guard let idx = project.clipTransitions.firstIndex(where: { $0.id == transitionId }) else { return }
        let previous = project.clipTransitions[idx]
        let updated = StoryClipTransition(id: previous.id,
                                          fromClipId: previous.fromClipId,
                                          toClipId: previous.toClipId,
                                          kind: kind,
                                          duration: duration,
                                          easing: previous.easing)
        let cmd = ChangeTransitionCommand(transitionId: transitionId, previous: previous, updated: updated)
        do {
            try cmd.apply(to: &project)
            commandStack.push(.changeTransition(cmd))
            scheduleEngineReconfigure()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    public func removeTransition(transitionId: String) {
        guard let idx = project.clipTransitions.firstIndex(where: { $0.id == transitionId }) else { return }
        let snapshot = project.clipTransitions[idx]
        let cmd = RemoveTransitionCommand(transitionId: transitionId,
                                          snapshot: snapshot,
                                          insertionIndex: idx)
        do {
            try cmd.apply(to: &project)
            commandStack.push(.removeTransition(cmd))
            scheduleEngineReconfigure()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
