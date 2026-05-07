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
        if let t = project.textObjects.first(where: { $0.id == id }) { return t.displayDuration }
        return nil
    }
}
