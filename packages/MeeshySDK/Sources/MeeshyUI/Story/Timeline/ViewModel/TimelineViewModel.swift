import Foundation
import UIKit
import Observation
import MeeshySDK

// MARK: - Engine abstraction (testable seam for StoryTimelineEngine)

// `TimelineEngineMode` is defined in `Story/Timeline/Model/TimelineEngineMode.swift`
// and shared by both StoryTimelineEngine (Plan 3) and TimelineViewModel (Plan 4).
// It is NOT redeclared here.

@MainActor
public protocol TimelineEngineProviding: AnyObject {
    var currentTime: Float { get }
    var isPlaying: Bool { get }
    var isMuted: Bool { get set }
    var masterVolume: Float { get set }

    var onTimeUpdate: ((Float) -> Void)? { get set }
    var onPlaybackEnd: (() -> Void)? { get set }
    var onElementBecameActive: ((String) -> Void)? { get set }
    var onError: ((Error) -> Void)? { get set }

    var mode: TimelineEngineMode { get }

    func configure(project: TimelineProject, mediaURLs: [String: URL], images: [String: UIImage]) async
    func play()
    func pause()
    func seek(to time: Float, precise: Bool)
    func stop()
    func toggle()
    func setMode(_ mode: TimelineEngineMode)
}

// MARK: - TimelineViewModel

@Observable
@MainActor
public final class TimelineViewModel {

    // MARK: - State observable by Views

    public internal(set) var project: TimelineProject
    public private(set) var currentTime: Float = 0
    public private(set) var isPlaying: Bool = false
    public private(set) var canUndo: Bool = false
    public private(set) var canRedo: Bool = false
    public internal(set) var isSnapEnabled: Bool = true
    public var selection: ClipSelectionState = .init()
    public var mode: TimelineMode = .quick
    public var zoomScale: CGFloat = 1.0
    public var errorMessage: String?
    public internal(set) var showOfflineQueuedConfirmation: Bool = false

    // MARK: - Dependencies

    private let engine: TimelineEngineProviding
    let commandStack: CommandStack
    let snapEngine: SnapEngine

    // MARK: - Media state (persisted across reconfigures)

    internal var pendingMediaURLs: [String: URL] = [:]
    private var pendingImages: [String: UIImage] = [:]

    // MARK: - Async bootstrap tracking

    private var bootstrapTask: Task<Void, Never>?

    public init(
        engine: TimelineEngineProviding,
        commandStack: CommandStack,
        snapEngine: SnapEngine
    ) {
        self.engine = engine
        self.commandStack = commandStack
        self.snapEngine = snapEngine
        self.project = TimelineProject(
            slideId: "",
            slideDuration: 0,
            mediaObjects: [],
            audioPlayerObjects: [],
            textObjects: [],
            clipTransitions: []
        )
        wireEngineCallbacks()
        wireCommandStackCallback()
    }

    // MARK: - Bootstrap

    public func bootstrap(project: TimelineProject, mediaURLs: [String: URL], images: [String: UIImage]) {
        self.project = project
        self.pendingMediaURLs = mediaURLs
        self.pendingImages = images

        // Cancel any in-flight bootstrap before reassigning so we don't race
        // two configure() calls on the same engine.
        bootstrapTask?.cancel()

        bootstrapTask = Task { [weak self, engine] in
            await engine.configure(project: project, mediaURLs: mediaURLs, images: images)
            guard !Task.isCancelled else { return }
            await MainActor.run { self?.engine.setMode(.editing) }
        }
    }

    /// Test helper — awaits the bootstrap configuration Task.
    public func awaitConfigured() async {
        await bootstrapTask?.value
    }

    // MARK: - Wiring

    private func wireEngineCallbacks() {
        engine.onTimeUpdate = { [weak self] time in
            self?.currentTime = time
        }
        engine.onPlaybackEnd = { [weak self] in
            self?.isPlaying = false
        }
        engine.onError = { [weak self] error in
            self?.errorMessage = error.localizedDescription
        }
        engine.onElementBecameActive = { [weak self] elementId in
            // Surface to selection so the inspector reflects the active clip
            // when playback crosses a clip boundary. Read-only signal — does
            // NOT push a command.
            self?.selection.select(elementId)
        }
    }

    private func wireCommandStackCallback() {
        commandStack.didChange = { [weak self] stack in
            // CommandStack is owned by MainActor ViewModel; didChange fires synchronously
            // on the same thread. Update synchronously to avoid a Task hop that would
            // make the state stale for the caller's next synchronous assertion.
            self?.canUndo = stack.canUndo
            self?.canRedo = stack.canRedo
        }
    }

    // MARK: - Selection

    public func selectClip(id: String?) {
        if let id { selection.select(id) } else { selection.deselect() }
    }

    // MARK: - Clip drag

    public func beginClipDrag(clipId: String) {
        guard let original = clipStartTime(id: clipId) else { return }
        selection.beginDrag(clipId: clipId, originalStartTime: original)
    }

    public func dragClipMoved(rawTime: Float, snapCandidates: [SnapCandidate]) {
        guard var drag = selection.activeDrag else { return }
        let snapResult = snapEngine.snap(rawTime: rawTime,
                                         candidates: snapCandidates,
                                         disabled: !isSnapEnabled)
        drag.currentStartTime = snapResult.snappedTime
        drag.snappedTo = mapSnapKind(snapResult.matched?.kind)
        selection.updateDrag(currentStartTime: drag.currentStartTime,
                             snappedTo: drag.snappedTo)
        applyClipPosition(clipId: drag.clipId, newStartTime: drag.currentStartTime)
    }

    public func endClipDrag() {
        guard let drag = selection.activeDrag,
              let kind = clipKind(forId: drag.clipId) else { return }

        // Skip pushing a no-op command — the user dragged exactly back to origin.
        let unchanged = abs(drag.currentStartTime - drag.originalStartTime) < 0.0005
        guard !unchanged else {
            selection.endDrag()
            return
        }

        let cmd = MoveClipCommand(
            clipId: drag.clipId,
            kind: kind,
            oldStartTime: drag.originalStartTime,
            newStartTime: drag.currentStartTime
        )
        commandStack.push(.moveClip(cmd))
        selection.endDrag()
    }

    /// Cancels an in-flight clip drag, restoring the clip's startTime to the value
    /// it had at beginClipDrag. Use this when a SwiftUI view is torn down
    /// mid-gesture (slide change, mode switch, dismiss) so the project stays
    /// consistent with the command stack.
    public func cancelClipDrag() {
        guard let drag = selection.activeDrag else { return }
        applyClipPosition(clipId: drag.clipId, newStartTime: drag.originalStartTime)
        selection.endDrag()
    }

    /// Returns the timeline-clip kind for a given object id.
    /// Looks up `mediaObjects` (image vs video via `kind`), `audioPlayerObjects` (.audio),
    /// then `textObjects` (.text). Returns nil if the id is not found in the project.
    public func clipKind(forId id: String) -> TimelineClipKind? {
        if let media = project.mediaObjects.first(where: { $0.id == id }) {
            return media.kind == .video ? .video : .image
        }
        if project.audioPlayerObjects.contains(where: { $0.id == id }) { return .audio }
        if project.textObjects.contains(where: { $0.id == id }) { return .text }
        return nil
    }

    // MARK: - History snapshot (test + persistence)

    public func commandHistorySnapshot() -> CommandStackSnapshot {
        commandStack.snapshot()
    }

    // MARK: - Private helpers

    func clipStartTime(id: String) -> Float? {
        if let m = project.mediaObjects.first(where: { $0.id == id }) { return m.startTime ?? 0 }
        if let a = project.audioPlayerObjects.first(where: { $0.id == id }) { return a.startTime ?? 0 }
        if let t = project.textObjects.first(where: { $0.id == id }) { return t.startTime ?? 0 }
        return nil
    }

    private func applyClipPosition(clipId: String, newStartTime: Float) {
        if let i = project.mediaObjects.firstIndex(where: { $0.id == clipId }) {
            project.mediaObjects[i].startTime = newStartTime
            return
        }
        if let i = project.audioPlayerObjects.firstIndex(where: { $0.id == clipId }) {
            project.audioPlayerObjects[i].startTime = newStartTime
            return
        }
        if let i = project.textObjects.firstIndex(where: { $0.id == clipId }) {
            project.textObjects[i].startTime = newStartTime
        }
    }

    private func mapSnapKind(_ kind: SnapCandidate.Kind?) -> ClipSelectionState.ActiveDrag.SnappedKind? {
        guard let kind else { return nil }
        switch kind {
        case .playhead:                     return .playhead
        case .clipStart, .slideStart:       return .clipStart
        case .clipEnd, .slideEnd:           return .clipEnd
        case .keyframe:                     return .keyframe
        case .gridMajor, .gridMinor:        return .grid
        }
    }

    // MARK: - Undo / Redo

    public func undo() {
        guard let command = commandStack.undo() else { return }
        do {
            try command.underlying.revert(from: &project)
            scheduleEngineReconfigure()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    public func redo() {
        guard let command = commandStack.redo() else { return }
        do {
            try command.underlying.apply(to: &project)
            scheduleEngineReconfigure()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    public func setMediaResolution(urls: [String: URL], images: [String: UIImage]) {
        pendingMediaURLs = urls
        pendingImages = images
    }

    func scheduleEngineReconfigure() {
        let snapshot = project
        let urls = pendingMediaURLs
        let images = pendingImages
        bootstrapTask?.cancel()
        bootstrapTask = Task { [engine] in
            await engine.configure(project: snapshot, mediaURLs: urls, images: images)
        }
    }

    // MARK: - Scrub & split

    public func scrub(to time: Float) {
        guard time.isFinite else { return }
        let clamped = max(0, min(time, project.slideDuration))
        currentTime = clamped
        engine.seek(to: clamped, precise: true)
    }

    public func splitSelectedAtPlayhead() {
        guard let id = selection.selectedClipId,
              let kind = clipKind(forId: id),
              let clipStart = clipStartTime(id: id),
              let clipDuration = clipDuration(forId: id) else { return }

        // Clamp BOTH ends so neither resulting half is zero-length, which
        // would crash AVPlayer on insertTimeRange.
        let minRel: Float = 0.001
        let maxRel = max(minRel, clipDuration - minRel)
        let raw = currentTime - clipStart
        let relativeTime = max(minRel, min(maxRel, raw))

        let cmd = SplitClipCommand(
            clipId: id,
            kind: kind,
            splitAtRelativeTime: relativeTime,
            leftId: UUID().uuidString,
            rightId: UUID().uuidString
        )
        do {
            try cmd.apply(to: &project)
            commandStack.push(.splitClip(cmd))
            scheduleEngineReconfigure()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Returns the duration of any clip (media/audio/text) by id, or nil.
    private func clipDuration(forId id: String) -> Float? {
        if let m = project.mediaObjects.first(where: { $0.id == id }) { return m.duration }
        if let a = project.audioPlayerObjects.first(where: { $0.id == id }) { return a.duration }
        if let t = project.textObjects.first(where: { $0.id == id }) { return t.displayDuration }
        return nil
    }

    // MARK: - Transitions

    public func addTransition(fromClipId: String, toClipId: String, kind: StoryTransitionKind, duration: Float) {
        guard fromClipId != toClipId else { return }
        let mediaIds = project.mediaObjects.map(\.id)
        guard mediaIds.contains(fromClipId), mediaIds.contains(toClipId) else { return }
        guard duration.isFinite, duration > 0 else { return }
        let transition = StoryClipTransition(
            fromClipId: fromClipId,
            toClipId: toClipId,
            kind: kind,
            duration: duration,
            easing: .linear
        )
        let cmd = AddTransitionCommand(transition: transition)
        do {
            try cmd.apply(to: &project)
            commandStack.push(.addTransition(cmd))
            scheduleEngineReconfigure()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Keyframes

    public func addKeyframeAtPlayhead(x: CGFloat? = nil, y: CGFloat? = nil,
                                      scale: CGFloat? = nil, opacity: CGFloat? = nil) {
        guard let id = selection.selectedClipId,
              let clipStart = clipStartTime(id: id) else { return }
        let relativeTime = max(0, currentTime - clipStart)
        let kf = StoryKeyframe(
            time: relativeTime,
            x: x, y: y, scale: scale, opacity: opacity,
            easing: .linear
        )
        guard let kind = clipKind(forId: id) else { return }
        let cmd = AddKeyframeCommand(clipId: id, kind: kind, keyframe: kf)
        do {
            try cmd.apply(to: &project)
            commandStack.push(.addKeyframe(cmd))
            scheduleEngineReconfigure()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Mode + snap toggles

    public func setMode(_ newMode: TimelineMode) {
        mode = newMode
    }

    public func toggleSnap() {
        isSnapEnabled.toggle()
    }

    // MARK: - Playback + mute convenience

    public func togglePlayback() {
        if isPlaying { engine.pause() } else { engine.play() }
        isPlaying.toggle()
    }

    public func toggleMute() {
        var muted = engine.isMuted
        muted.toggle()
        engine.isMuted = muted
    }

    // MARK: - Persistence

    public func restoreCommandHistory(_ snapshot: CommandStackSnapshot) {
        let originalProject = project
        commandStack.restore(snapshot)
        let stackSnapshot = commandStack.snapshot()

        var rollback = false
        for index in 0..<stackSnapshot.cursor where index < stackSnapshot.commands.count {
            do {
                try stackSnapshot.commands[index].underlying.apply(to: &project)
            } catch {
                errorMessage = "Restore failed at command \(index): \(error.localizedDescription)"
                rollback = true
                break
            }
        }

        if rollback {
            // Atomic: revert everything we just applied + clear the broken stack.
            project = originalProject
            commandStack.restore(CommandStackSnapshot(commands: [], cursor: 0))
        }
        scheduleEngineReconfigure()
    }

}
