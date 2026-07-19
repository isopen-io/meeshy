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
              let currentStart = clipStartTime(id: id) else { return }
        // Clip « permanent » (duration nil — tout texte fraîchement posé) :
        // le trim MATÉRIALISE sa fenêtre effective (start → slideDuration)
        // puis l'ajuste — sans ça les poignées étaient inertes sur ces clips.
        let currentDuration = clipDuration(id: id)
            ?? TimelineGeometry.effectiveClipDuration(startTime: currentStart,
                                                      duration: nil,
                                                      slideDuration: project.slideDuration)
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
            recomputeSlideDuration()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Trim the end handle of a clip by `deltaTimeSeconds` (positive = extend right).
    /// Clamps to `mediaDurationLimit` when provided (source media length).
    public func trimClipEnd(id: String, deltaTimeSeconds: Float, mediaDurationLimit: Float? = nil) {
        guard deltaTimeSeconds.isFinite else { return }
        guard let kind = clipKind(forId: id),
              let currentStart = clipStartTime(id: id) else { return }
        // Même matérialisation de fenêtre que trimClipStart pour les clips
        // permanents (duration nil).
        let currentDuration = clipDuration(id: id)
            ?? TimelineGeometry.effectiveClipDuration(startTime: currentStart,
                                                      duration: nil,
                                                      slideDuration: project.slideDuration)
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
            recomputeSlideDuration()
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
            recomputeSlideDuration()
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
            recomputeSlideDuration()
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

    // MARK: - Slide duration pin (DurationHandle)

    /// Pin direct de la durée de la slide (poignée en fin de ruler). Mutation
    /// directe du projet, comme `extendSlideDurationIfNeeded` (le set de
    /// commandes Plan 1 n'a pas de commande slide-duration) — le pin devient
    /// `effects.timelineDuration` au commit (Option A : peut ÉTENDRE la slide
    /// au-delà du contenu ou la ROGNER en deçà).
    public func setSlideDuration(_ duration: Float) {
        guard duration.isFinite else { return }
        let clamped = max(1, min(600, duration))
        guard abs(clamped - project.slideDuration) > 0.001 else { return }
        project.slideDuration = clamped
        if currentTime > clamped {
            scrub(to: clamped, precise: true)
        }
        scheduleEngineReconfigure()
    }

    // MARK: - Snap disabled toggle (two-finger drag override)

    /// Programmatically disable or enable snap — used when a two-finger drag
    /// signals the user wants free positioning without snapping.
    public func setSnapDisabled(_ disabled: Bool) {
        isSnapEnabled = !disabled
    }

    // MARK: - Internal clip dimension helper (accessible to extension)

    func clipDuration(id: String) -> Float? {
        if let m = project.mediaObjects.first(where: { $0.id == id }) { return m.duration.map { Float($0) } }
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
        let oldFadeIn: Double?
        switch kind {
        case .video, .image:
            oldFadeIn = project.mediaObjects.first(where: { $0.id == id })?.fadeIn
        case .audio:
            oldFadeIn = project.audioPlayerObjects.first(where: { $0.id == id })?.fadeIn.map { Double($0) }
        case .text:
            oldFadeIn = project.textObjects.first(where: { $0.id == id })?.fadeIn
        }
        let cmd = SetClipPropertyCommand(clipId: id, kind: kind,
                                         property: .fadeIn(old: oldFadeIn, new: Double(fadeIn)))
        applySetClipProperty(cmd)
    }

    public func setClipFadeOut(id: String, fadeOut: Float) {
        guard let kind = clipKind(forId: id) else { return }
        let oldFadeOut: Double?
        switch kind {
        case .video, .image:
            oldFadeOut = project.mediaObjects.first(where: { $0.id == id })?.fadeOut
        case .audio:
            oldFadeOut = project.audioPlayerObjects.first(where: { $0.id == id })?.fadeOut.map { Double($0) }
        case .text:
            oldFadeOut = project.textObjects.first(where: { $0.id == id })?.fadeOut
        }
        let cmd = SetClipPropertyCommand(clipId: id, kind: kind,
                                         property: .fadeOut(old: oldFadeOut, new: Double(fadeOut)))
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
            recomputeSlideDuration()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Keyframe mutations

    public func moveKeyframe(clipId: String, keyframeId: String, newTime: Float) {
        guard let kind = clipKind(forId: clipId),
              let snapshot = currentKeyframeSnapshot(clipId: clipId, keyframeId: keyframeId, kind: kind) else { return }
        let cmd = MoveKeyframeCommand(clipId: clipId, kind: kind,
                                      keyframeId: keyframeId,
                                      oldTime: snapshot.time, newTime: newTime)
        applyMoveKeyframeCommand(cmd)
    }

    /// Push a transform / easing edit captured by `KeyframeInspector`.
    /// All arguments are optional — only non-nil pairs (new + current snapshot)
    /// participate in the resulting `MoveKeyframeCommand`. `newTime` defaults
    /// to the current time so an inspector-driven edit doesn't shift the
    /// keyframe along the timeline.
    ///
    /// Each edit pushes its own command so coalescing in `CommandStack` can
    /// collapse a 60fps slider drag into a single undo step.
    public func moveKeyframe(clipId: String,
                             keyframeId: String,
                             position: CGPoint? = nil,
                             scale: CGFloat? = nil,
                             opacity: CGFloat? = nil,
                             easing: StoryEasing? = nil) {
        guard let kind = clipKind(forId: clipId),
              let snapshot = currentKeyframeSnapshot(clipId: clipId, keyframeId: keyframeId, kind: kind) else { return }
        // Audio keyframes are unsupported — currentKeyframeSnapshot already
        // returns nil for audio, but keep the guard structurally similar to
        // the time-only overload so a future audio-keyframe surface lights up
        // both call paths at once.
        let cmd = MoveKeyframeCommand(
            clipId: clipId, kind: kind, keyframeId: keyframeId,
            oldTime: snapshot.time, newTime: snapshot.time,
            oldX: position != nil ? snapshot.x : nil,
            newX: position?.x,
            oldY: position != nil ? snapshot.y : nil,
            newY: position?.y,
            oldScale: scale != nil ? snapshot.scale : nil,
            newScale: scale,
            oldOpacity: opacity != nil ? snapshot.opacity : nil,
            newOpacity: opacity,
            oldEasing: easing != nil ? snapshot.easing : nil,
            newEasing: easing
        )
        applyMoveKeyframeCommand(cmd)
    }

    private func applyMoveKeyframeCommand(_ cmd: MoveKeyframeCommand) {
        do {
            try cmd.apply(to: &project)
            commandStack.push(.moveKeyframe(cmd))
            scheduleEngineReconfigure()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Resolves the keyframe currently in the project state into a snapshot of
    /// all its persisted fields. Returns nil for audio clips or when the
    /// keyframe id is not found. Surfaces defaults that match
    /// `KeyframeInspector.KeyframeSnapshot` so the inspector and command stack
    /// stay aligned on what "no value" means.
    private func currentKeyframeSnapshot(clipId: String,
                                         keyframeId: String,
                                         kind: TimelineClipKind)
        -> (time: Float, x: CGFloat, y: CGFloat, scale: CGFloat, opacity: CGFloat, easing: StoryEasing)? {
        let keyframe: StoryKeyframe?
        switch kind {
        case .video, .image:
            keyframe = project.mediaObjects.first(where: { $0.id == clipId })?
                .keyframes?.first(where: { $0.id == keyframeId })
        case .text:
            keyframe = project.textObjects.first(where: { $0.id == clipId })?
                .keyframes?.first(where: { $0.id == keyframeId })
        case .audio:
            return nil
        }
        guard let kf = keyframe else { return nil }
        return (
            time: kf.time,
            x: kf.x ?? 0.5,
            y: kf.y ?? 0.5,
            scale: kf.scale ?? 1.0,
            opacity: kf.opacity ?? 1.0,
            easing: kf.easing ?? .linear
        )
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

    public func changeTransition(transitionId: String, kind: StoryTransitionKind, duration: Float,
                                 easing: StoryEasing? = nil) {
        guard let idx = project.clipTransitions.firstIndex(where: { $0.id == transitionId }) else { return }
        let previous = project.clipTransitions[idx]
        let updated = StoryClipTransition(id: previous.id,
                                          fromClipId: previous.fromClipId,
                                          toClipId: previous.toClipId,
                                          kind: kind,
                                          duration: duration,
                                          easing: easing ?? previous.easing)
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
