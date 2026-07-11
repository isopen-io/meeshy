import Foundation
import UIKit
import Combine
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
    /// Teardown explicite (AVPlayer, observers, audio mixer). Idempotent.
    /// L'owner DOIT l'appeler avant de lâcher l'engine — cf. le contrat
    /// documenté de `StoryTimelineEngine.shutdown()`.
    func shutdown()
}

// MARK: - TimelineViewModel

@MainActor
public final class TimelineViewModel: ObservableObject {

    // MARK: - State observable by Views

    @Published public internal(set) var project: TimelineProject
    @Published public private(set) var currentTime: Float = 0 {
        didSet { onPlayheadChanged?(currentTime) }
    }
    @Published public private(set) var isPlaying: Bool = false {
        didSet {
            guard oldValue != isPlaying else { return }
            onPlaybackStateChanged?(isPlaying)
        }
    }

    // MARK: - Preview bridge (Lot B — living preview)

    /// Fired on EVERY playhead move — scrub frames and engine playback ticks
    /// alike. The composer wires this to the canvas behind the timeline sheet
    /// (via `StoryCanvasTimelineBridge`) so the canvas renders the slide at
    /// the playhead, at UIKit level, without re-evaluating the composer's
    /// SwiftUI body 60 times per second.
    public var onPlayheadChanged: ((Float) -> Void)?
    /// Fired when playback starts/stops (transport toggle, playback end).
    /// The canvas uses it to switch between seek-paused (scrub) and
    /// play-muted-in-sync (engine owns the audio) preview strategies.
    public var onPlaybackStateChanged: ((Bool) -> Void)?
    /// Mirror of `engine.isMuted` so SwiftUI views (TransportBar mute button)
    /// re-render on toggle. The engine remains the audio-routing source of
    /// truth — this stored property is the @Published view-state seam that
    /// tracks it. Keep them in lock-step inside `toggleMute()`.
    @Published public private(set) var isMuted: Bool = false
    @Published public private(set) var canUndo: Bool = false
    @Published public private(set) var canRedo: Bool = false
    @Published public internal(set) var isSnapEnabled: Bool = true
    @Published public var selection: ClipSelectionState = .init()
    @Published public var mode: TimelineMode = .quick
    @Published public var zoomScale: CGFloat = 1.0
    @Published public var errorMessage: String?
    @Published public internal(set) var showOfflineQueuedConfirmation: Bool = false
    /// True between `beginScrub()` and `endScrub()` — flipped by the playhead
    /// gesture so `scrub(to:)` can choose a sub-50ms tolerance during the drag
    /// and a frame-accurate seek on release. Mirrors `selection.activeDrag` for
    /// clip drags. Default `false` keeps every legacy `scrub(to:)` caller on a
    /// precise seek.
    @Published public private(set) var isScrubbing: Bool = false

    // MARK: - Dependencies

    private let engine: TimelineEngineProviding
    let commandStack: CommandStack
    let snapEngine: SnapEngine

    // MARK: - Media state (persisted across reconfigures)

    internal var pendingMediaURLs: [String: URL] = [:]
    private var pendingImages: [String: UIImage] = [:]

    /// Exposes the still-image bitmap registered for `clipId` (image media
    /// objects). Track views read this to render an inline thumbnail strip
    /// on image clips — the underlying playback engine doesn't surface
    /// individual image bitmaps because it only needs them at draw time.
    public func loadedImage(for clipId: String) -> UIImage? {
        pendingImages[clipId]
    }

    /// URL registered for a video / audio clip. Used by track views that
    /// want to display an inline preview strip — they hand the URL to a
    /// frame extractor and cache the resulting frames per zoom level.
    public func loadedURL(for clipId: String) -> URL? {
        pendingMediaURLs[clipId]
    }

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
        self.isMuted = engine.isMuted
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

    // MARK: - Teardown

    /// Teardown explicite, à appeler par l'owner à la fermeture du composer.
    /// Sans cet appel, l'engine n'était JAMAIS shutdown en production : son
    /// observer périodique AVPlayer n'était pas retiré avant la libération du
    /// player (contrat AVFoundation), l'AVAudioEngine du mixer restait actif
    /// et un preview en cours continuait de jouer.
    public func shutdown() {
        bootstrapTask?.cancel()
        bootstrapTask = nil
        engine.shutdown()
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
        let previouslySnapped = drag.snappedTo != nil
        // Aimantation : on complète les candidats fournis par les bords (début ET
        // fin) de TOUS les autres objets du canvas, plus les bornes du slide et la
        // tête de lecture — « coordinateurs entre le début et la fin des objets par
        // effet magnet quand un objet est proche de la fin d'un autre ».
        let magnetCandidates = magneticSnapCandidates(excludingClipId: drag.clipId)
        // Tolérance adaptée au zoom (~8pt de doigt). L'engine figé à 0.06s était
        // trop serré pour un aimant perceptible ; le magnet doit accrocher dès
        // qu'un bord approche visuellement celui d'un autre.
        let pixelsPerSecond = max(1, Float(50.0 * zoomScale))
        let magnetEngine = SnapEngine(toleranceSeconds: 8.0 / pixelsPerSecond)
        let snapResult = magnetEngine.snap(rawTime: rawTime,
                                           candidates: snapCandidates + magnetCandidates,
                                           disabled: !isSnapEnabled)
        drag.currentStartTime = snapResult.snappedTime
        drag.snappedTo = mapSnapKind(snapResult.matched?.kind)
        // Retour haptique léger au MOMENT où l'aimant accroche (transition
        // non-accroché → accroché), pas à chaque frame.
        if drag.snappedTo != nil, !previouslySnapped {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }
        selection.updateDrag(currentStartTime: drag.currentStartTime,
                             snappedTo: drag.snappedTo)
        applyClipPosition(clipId: drag.clipId, newStartTime: drag.currentStartTime)
    }

    /// Points d'accroche magnétiques pour un drag de clip : les bords `début` et
    /// `fin` de chaque AUTRE objet du canvas (media, audio, texte), plus les
    /// bornes du slide (`0` / `slideDuration`) et la tête de lecture. C'est ce
    /// jeu de candidats qui manquait (tous les call sites passaient `[]`), rendant
    /// l'aimantation inopérante malgré un moteur de snap déjà branché.
    func magneticSnapCandidates(excludingClipId excluded: String) -> [SnapCandidate] {
        var candidates: [SnapCandidate] = [
            SnapCandidate(kind: .slideStart, time: 0),
            SnapCandidate(kind: .slideEnd, time: project.slideDuration),
            SnapCandidate(kind: .playhead, time: currentTime)
        ]
        func addEdges(id: String, start: Float, duration: Float) {
            guard id != excluded else { return }
            candidates.append(SnapCandidate(kind: .clipStart, time: start))
            candidates.append(SnapCandidate(kind: .clipEnd, time: start + max(0, duration)))
        }
        for m in project.mediaObjects {
            addEdges(id: m.id, start: Float(m.startTime ?? 0), duration: Float(m.duration ?? 0))
        }
        for a in project.audioPlayerObjects {
            addEdges(id: a.id, start: a.startTime ?? 0, duration: a.duration ?? 0)
        }
        for t in project.textObjects {
            addEdges(id: t.id, start: Float(t.startTime ?? 0), duration: Float(t.duration ?? 0))
        }
        return candidates
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
        if let m = project.mediaObjects.first(where: { $0.id == id }) { return Float(m.startTime ?? 0) }
        if let a = project.audioPlayerObjects.first(where: { $0.id == id }) { return a.startTime ?? 0 }
        if let t = project.textObjects.first(where: { $0.id == id }) { return Float(t.startTime ?? 0) }
        return nil
    }

    private func applyClipPosition(clipId: String, newStartTime: Float) {
        if let i = project.mediaObjects.firstIndex(where: { $0.id == clipId }) {
            project.mediaObjects[i].startTime = Double(newStartTime)
            extendSlideDurationIfNeeded(
                elementEnd: newStartTime + Float(project.mediaObjects[i].duration ?? 0)
            )
            return
        }
        if let i = project.audioPlayerObjects.firstIndex(where: { $0.id == clipId }) {
            project.audioPlayerObjects[i].startTime = newStartTime
            extendSlideDurationIfNeeded(
                elementEnd: newStartTime + (project.audioPlayerObjects[i].duration ?? 0)
            )
            return
        }
        if let i = project.textObjects.firstIndex(where: { $0.id == clipId }) {
            project.textObjects[i].startTime = Double(newStartTime)
            extendSlideDurationIfNeeded(
                elementEnd: newStartTime + Float(project.textObjects[i].duration ?? 0)
            )
        }
    }

    /// Auto-extends the working `project.slideDuration` when an element is
    /// dragged past the current playable range. Without this, the playhead
    /// (which clamps at `slideDuration`) couldn't reach the element's tail
    /// after the drop and the ruler / clip lane wouldn't visualise it. The
    /// computed total duration handles persistence — this is the live in-edit
    /// equivalent so the editor follows the user's intent in real time.
    private func extendSlideDurationIfNeeded(elementEnd: Float) {
        guard elementEnd.isFinite, elementEnd > project.slideDuration else { return }
        project.slideDuration = elementEnd
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

    /// Marks the start of a continuous playhead drag. While `isScrubbing` is
    /// `true`, every `scrub(to:)` call forwards `precise: false` to the engine
    /// (sub-50ms tolerance), avoiding the GOP-decompression freeze AVPlayer
    /// triggers at 60 calls/sec under `.zero` tolerance. The playhead gesture
    /// must call `endScrub()` once on release so the final seek is precise.
    public func beginScrub() {
        isScrubbing = true
    }

    /// Marks the end of a continuous playhead drag. Subsequent `scrub(to:)`
    /// calls go back to frame-accurate seeking. Safe to call when no scrub is
    /// in flight (idempotent). When a scrub WAS in flight, the release
    /// position is re-seeked with frame accuracy — every drag frame used
    /// sub-50ms tolerance, so without this anchor the frame on screen can be
    /// up to 50ms away from where the user released.
    public func endScrub() {
        guard isScrubbing else { return }
        isScrubbing = false
        engine.seek(to: currentTime, precise: true)
    }

    /// Seeks the engine to `time`. Precision is auto-selected from
    /// `isScrubbing` — wrap a continuous drag with `beginScrub()` /
    /// `endScrub()` to get sub-50ms response during the drag and a precise
    /// seek on release. Single-shot calls (no `beginScrub()`) stay precise.
    public func scrub(to time: Float) {
        scrub(to: time, precise: !isScrubbing)
    }

    /// Explicit-precision overload — lets callers pin the tolerance regardless
    /// of `isScrubbing`. Used by adjustable accessibility actions, keyboard
    /// shortcuts, and tests that need a deterministic precise seek.
    public func scrub(to time: Float, precise: Bool) {
        guard time.isFinite else { return }
        let clamped = max(0, min(time, project.slideDuration))
        currentTime = clamped
        engine.seek(to: clamped, precise: precise)
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
        if let m = project.mediaObjects.first(where: { $0.id == id }) { return m.duration.map { Float($0) } }
        if let a = project.audioPlayerObjects.first(where: { $0.id == id }) { return a.duration }
        if let t = project.textObjects.first(where: { $0.id == id }) { return t.duration.map { Float($0) } }
        return nil
    }

    // MARK: - Transitions

    /// Returns the created transition's id (for routing the selection to the
    /// TransitionInspector right after creation), or nil when rejected.
    @discardableResult
    public func addTransition(fromClipId: String, toClipId: String, kind: StoryTransitionKind, duration: Float) -> String? {
        guard fromClipId != toClipId else { return nil }
        let mediaIds = project.mediaObjects.map(\.id)
        guard mediaIds.contains(fromClipId), mediaIds.contains(toClipId) else { return nil }
        guard duration.isFinite, duration > 0 else { return nil }
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
            return transition.id
        } catch {
            errorMessage = error.localizedDescription
            return nil
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
        // Mirror onto the @Published view-state seam. Read the engine back
        // (instead of trusting `muted`) so any clamping or refusal applied by
        // the engine setter is reflected truthfully to the UI.
        isMuted = engine.isMuted
    }

    // MARK: - Persistence

    /// E4 — restore du stack SANS rejouer les commandes : à utiliser quand
    /// `project` est DÉJÀ l'état au cursor (slide committée rechargée dans un
    /// moteur frais). `restoreCommandHistory` ci-dessous, lui, REJOUE le
    /// préfixe et suppose un projet à l'état d'origine — sur un projet
    /// committé il double-appliquerait les commandes non idempotentes
    /// (AddClip → clip dupliqué). Sûr car les commandes sont auto-inversibles
    /// (`revert(from:)` opère depuis l'état courant).
    public func restoreCommandHistoryWithoutReplay(_ snapshot: CommandStackSnapshot) {
        commandStack.restore(snapshot)
    }

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
