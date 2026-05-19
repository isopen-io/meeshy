import SwiftUI
import AVFoundation
import Combine
import UIKit
import MeeshySDK

/// Central state for the unified video editor.
///
/// Owns the non-destructive `VideoEditDocument` (via `VideoEditHistory`), the
/// preview `AVPlayer`, the timeline, transcription and the export pipeline.
/// All views observe this single object — the FAB column, the bottom-band
/// controllers and the timeline never hold private editing state.
@MainActor
public final class VideoEditorViewModel: ObservableObject {

    // MARK: Phases

    public enum TranscriptionPhase: Equatable {
        case idle
        case running
        case done
        case failed(String)
    }

    public enum ExportPhase: Equatable {
        case idle
        case preparing
        case exporting(Double)
        case failed(String)

        public var isBusy: Bool {
            switch self {
            case .idle, .failed: return false
            case .preparing, .exporting: return true
            }
        }
    }

    public struct Banner: Equatable, Identifiable {
        public let id = UUID()
        public let message: String
        public let isError: Bool
    }

    // MARK: Published state

    @Published public private(set) var document: VideoEditDocument
    @Published public private(set) var canUndo = false
    @Published public private(set) var canRedo = false

    @Published public var mode: VideoEditorMode = .simple
    @Published public var panel: VideoEditorPanel = .none

    @Published public private(set) var isPlaying = false
    @Published public private(set) var playheadTime: Double = 0
    @Published public var isScrubbing = false
    @Published public private(set) var isReady = false

    @Published public var timelineZoom: CGFloat = 1
    @Published public var selectedSegmentID: UUID?

    @Published public private(set) var filmstrip: [UIImage] = []

    @Published public private(set) var transcription: TranscriptionPhase = .idle
    @Published public private(set) var exportPhase: ExportPhase = .idle

    @Published public var pendingRecovery: VideoEditDocument?
    @Published public var banner: Banner?

    // MARK: Dependencies

    public let context: MediaPreviewContext
    public let accentColor: String
    public let player: AVPlayer

    private let sourceURL: URL
    private let onComplete: (VideoEditResult) -> Void
    private let onCancel: () -> Void

    private var history: VideoEditHistory
    private let exportPipeline = VideoExportPipeline()

    // MARK: Tasks / observers

    private var timeObserver: Any?
    private var loopObserver: NSObjectProtocol?
    private var rebuildTask: Task<Void, Never>?
    private var rebuildGeneration = 0
    private var autosaveTask: Task<Void, Never>?
    private var transcriptionTask: Task<Void, Never>?
    private var exportTask: Task<Void, Never>?

    // MARK: Init

    public init(
        url: URL,
        context: MediaPreviewContext,
        accentColor: String,
        onComplete: @escaping (VideoEditResult) -> Void,
        onCancel: @escaping () -> Void
    ) {
        self.sourceURL = url
        self.context = context
        self.accentColor = accentColor
        self.onComplete = onComplete
        self.onCancel = onCancel

        let placeholder = VideoEditDocument(
            sourceURL: url,
            sourceDuration: 0,
            naturalWidth: 1080,
            naturalHeight: 1920,
            hasAudioTrack: true
        )
        self.document = placeholder
        self.history = VideoEditHistory(initial: placeholder)
        self.player = AVPlayer(url: url)
        self.player.actionAtItemEnd = .pause
    }

    // MARK: Lifecycle

    public func load() async {
        installTimeObserver()
        do {
            let probed = try await VideoCompositionBuilder.probe(url: sourceURL)
            document = probed
            history = VideoEditHistory(initial: probed)
            if let recovered = await VideoEditSessionStore.shared.recoverableSession(for: sourceURL) {
                pendingRecovery = recovered
            }
        } catch {
            present(error)
        }
        await rebuild(immediate: true)
        isReady = true
        play()
        Task { [weak self] in await self?.loadFilmstrip() }
    }

    public func teardown() {
        rebuildTask?.cancel()
        autosaveTask?.cancel()
        transcriptionTask?.cancel()
        exportTask?.cancel()
        exportPipeline.cancel()
        if let timeObserver { player.removeTimeObserver(timeObserver) }
        if let loopObserver { NotificationCenter.default.removeObserver(loopObserver) }
        timeObserver = nil
        loopObserver = nil
        player.pause()
    }

    public func handleScenePhase(_ phase: ScenePhase) {
        guard phase != .active else { return }
        pause()
        let snapshot = document
        if snapshot.hasEdits {
            Task { await VideoEditSessionStore.shared.save(snapshot) }
        }
    }

    // MARK: Derived

    public var editedDuration: Double {
        max(0.05, document.editedDuration)
    }

    public var selectedSegment: VideoSegment? {
        guard let id = selectedSegmentID else { return nil }
        return document.segments.first { $0.id == id }
    }

    public func tools(for category: VideoEditorToolCategory) -> [VideoEditorTool] {
        category.tools.filter { $0.isAvailable(in: mode) }
    }

    public var isExporting: Bool { exportPhase.isBusy }

    // MARK: Document mutation

    /// Records a discrete edit and rebuilds the preview.
    public func apply(_ newDocument: VideoEditDocument) {
        guard newDocument != document else { return }
        history.commit(newDocument)
        document = history.current
        syncHistoryFlags()
        scheduleRebuild()
        scheduleAutosave()
    }

    /// Live, uncommitted update for a continuous gesture (sliders). Pair with
    /// `commitPreview()` when the gesture ends.
    public func preview(_ newDocument: VideoEditDocument) {
        document = newDocument
        scheduleRebuild()
    }

    public func commitPreview() {
        history.commit(document)
        document = history.current
        syncHistoryFlags()
        scheduleAutosave()
    }

    public func undo() {
        guard let restored = history.undo() else { return }
        document = restored
        syncHistoryFlags()
        scheduleRebuild()
        scheduleAutosave()
        HapticFeedback.light()
    }

    public func redo() {
        guard let restored = history.redo() else { return }
        document = restored
        syncHistoryFlags()
        scheduleRebuild()
        scheduleAutosave()
        HapticFeedback.light()
    }

    private func syncHistoryFlags() {
        canUndo = history.canUndo
        canRedo = history.canRedo
        if let id = selectedSegmentID, !document.segments.contains(where: { $0.id == id }) {
            selectedSegmentID = nil
        }
    }

    // MARK: Discrete operations

    public func splitAtPlayhead() {
        guard mode.isPro else { return }
        let updated = document.splitting(atEditedTime: playheadTime)
        guard updated != document else {
            present(message: "Position trop proche d'une coupe", isError: false)
            return
        }
        apply(updated)
        HapticFeedback.medium()
    }

    public func rotate() {
        apply(document.rotatedClockwise())
        HapticFeedback.light()
    }

    public func removeSegment(_ id: UUID) {
        guard document.segments.count > 1 else { return }
        apply(document.removingSegment(id: id))
        HapticFeedback.medium()
    }

    public func moveSegment(_ id: UUID, to index: Int) {
        apply(document.movingSegment(id: id, toIndex: index))
        HapticFeedback.light()
    }

    /// Rejoins a segment with its predecessor without dropping any media
    /// (the non-destructive "merge" — undo of a split).
    public func mergeSegment(_ id: UUID) {
        let merged = document.mergingSegment(id: id)
        guard merged != document else { return }
        apply(merged)
        HapticFeedback.medium()
    }

    public func setFilter(_ filter: VideoFilterPreset) {
        apply(document.settingFilter(filter))
        HapticFeedback.light()
    }

    public func setCropRatio(_ ratio: CropRatio?) {
        guard let ratio, let aspect = ratio.aspectRatio else {
            apply(document.settingCrop(.full))
            HapticFeedback.light()
            return
        }
        let sourceAspect = document.naturalWidth / max(1, document.naturalHeight)
        let rect = NormalizedRect.centered(targetAspect: aspect, sourceAspect: sourceAspect)
        apply(document.settingCrop(rect))
        HapticFeedback.light()
    }

    public func toggleMute() {
        apply(document.togglingMute())
        HapticFeedback.light()
    }

    public func resetAllEdits() {
        apply(document.resettingAllEdits())
        selectedSegmentID = nil
        HapticFeedback.medium()
    }

    // MARK: Recovery

    public func acceptRecovery() {
        guard let recovered = pendingRecovery else { return }
        pendingRecovery = nil
        apply(recovered)
        HapticFeedback.success()
    }

    public func discardRecovery() {
        pendingRecovery = nil
        Task { await VideoEditSessionStore.shared.clearSession(for: sourceURL) }
    }

    // MARK: Mode & band

    public func setMode(_ newMode: VideoEditorMode) {
        guard newMode != mode else { return }
        mode = newMode
        if newMode == .simple {
            selectedSegmentID = nil
            if let tool = panel.activeTool, tool.isProOnly {
                panel = .tiles(tool.category)
            }
        }
        HapticFeedback.light()
    }

    public func tapFAB(_ category: VideoEditorToolCategory) {
        HapticFeedback.medium()
        switch panel {
        case .none:
            panel = .tiles(category)
        case .tiles(let current):
            panel = current == category ? .none : .tiles(category)
        case .tool(let tool):
            panel = tool.category == category ? .none : .tiles(category)
        }
    }

    public func selectTool(_ tool: VideoEditorTool) {
        HapticFeedback.light()
        if selectedSegmentID == nil, mode.isPro {
            selectedSegmentID = document.locate(editedTime: playheadTime).map { document.segments[$0.index].id }
        }
        panel = .tool(tool)
    }

    public func backToTiles() {
        if let category = panel.activeTool?.category {
            panel = .tiles(category)
        } else {
            panel = .none
        }
        HapticFeedback.light()
    }

    public func dismissPanel() {
        panel = .none
        HapticFeedback.light()
    }

    // MARK: Playback

    public func togglePlayback() {
        if isPlaying {
            pause()
        } else {
            if playheadTime >= editedDuration - 0.06 {
                seek(to: 0)
            }
            play()
        }
        HapticFeedback.light()
    }

    public func play() {
        guard !isExporting else { return }
        player.play()
        isPlaying = true
    }

    public func pause() {
        player.pause()
        isPlaying = false
    }

    public func seek(to editedTime: Double) {
        let clamped = min(max(0, editedTime), editedDuration)
        playheadTime = clamped
        player.seek(
            to: CMTime(seconds: clamped, preferredTimescale: 600),
            toleranceBefore: .zero,
            toleranceAfter: .zero
        )
    }

    public func beginScrub() {
        isScrubbing = true
        pause()
    }

    public func scrub(toFraction fraction: Double) {
        seek(to: fraction * editedDuration)
    }

    public func endScrub() {
        isScrubbing = false
        HapticFeedback.light()
    }

    // MARK: Transcription

    public func transcribe(languageCode: String) {
        transcriptionTask?.cancel()
        transcription = .running
        let url = sourceURL
        let locale = Locale(identifier: languageCode)
        transcriptionTask = Task { [weak self] in
            do {
                let result = try await EdgeTranscriptionService.shared.transcribe(
                    audioURL: url,
                    locale: locale,
                    timeout: 45
                )
                guard let self, !Task.isCancelled else { return }
                self.applyTranscription(result, languageCode: languageCode)
            } catch is CancellationError {
                return
            } catch {
                guard let self, !Task.isCancelled else { return }
                self.transcription = .failed(self.message(for: error))
            }
        }
    }

    public func cancelTranscription() {
        transcriptionTask?.cancel()
        transcriptionTask = nil
        if transcription == .running { transcription = .idle }
    }

    public func clearCaptions() {
        apply(document.clearingCaptions())
        transcription = .idle
    }

    private func applyTranscription(_ result: OnDeviceTranscription, languageCode: String) {
        let captions = buildCaptions(from: result)
        apply(document.settingCaptions(
            captions,
            languageCode: languageCode,
            transcription: result.text
        ))
        transcription = .done
        HapticFeedback.success()
    }

    private func buildCaptions(from transcription: OnDeviceTranscription) -> [VideoCaption] {
        let words = transcription.segments
        guard !words.isEmpty else {
            let text = transcription.text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else { return [] }
            return [VideoCaption(start: 0, end: editedDuration, text: text)]
        }

        var captions: [VideoCaption] = []
        var bucket: [OnDeviceTranscriptionSegment] = []
        let maxCharacters = 42
        let maxGap = 0.7

        func flush() {
            guard let first = bucket.first, let last = bucket.last else { return }
            let text = bucket.map(\.text).joined(separator: " ")
            guard let start = document.editedTime(forSourceTime: first.timestamp) else {
                bucket = []
                return
            }
            let end = document.editedTime(forSourceTime: last.timestamp + last.duration) ?? (start + 2)
            captions.append(VideoCaption(start: start, end: max(end, start + 0.4), text: text))
            bucket = []
        }

        for word in words {
            if let last = bucket.last {
                let gap = word.timestamp - (last.timestamp + last.duration)
                let lengthSoFar = bucket.reduce(0) { $0 + $1.text.count + 1 }
                if gap > maxGap || lengthSoFar + word.text.count > maxCharacters {
                    flush()
                }
            }
            bucket.append(word)
        }
        flush()
        return captions
    }

    public func caption(at time: Double) -> VideoCaption? {
        document.captions.first { time >= $0.start && time <= $0.end }
    }

    // MARK: Export / confirm

    public func confirm() {
        guard !isExporting else { return }
        if !document.hasEdits {
            deliver(url: sourceURL, didEdit: false)
            return
        }
        pause()
        exportPhase = .preparing
        let snapshot = document
        exportTask = Task { [weak self] in
            guard let self else { return }
            do {
                let plan = try await VideoCompositionBuilder.build(document: snapshot)
                guard !Task.isCancelled else { return }
                self.exportPhase = .exporting(0)
                let url = try await self.exportPipeline.export(plan: plan) { progress in
                    Task { @MainActor [weak self] in
                        guard let self, case .exporting = self.exportPhase else { return }
                        self.exportPhase = .exporting(progress)
                    }
                }
                guard !Task.isCancelled else { return }
                await VideoEditSessionStore.shared.clearSession(for: self.sourceURL)
                self.deliver(url: url, didEdit: true)
            } catch let error as VideoEditError where error.isCancellation {
                self.exportPhase = .idle
            } catch {
                self.exportPhase = .failed(self.message(for: error))
                HapticFeedback.error()
            }
        }
    }

    public func cancelExport() {
        exportTask?.cancel()
        exportPipeline.cancel()
        exportPhase = .idle
    }

    public func cancelEditing() {
        teardown()
        onCancel()
    }

    private func deliver(url: URL, didEdit: Bool) {
        let result = VideoEditResult(
            url: url,
            didEdit: didEdit,
            duration: document.editedDuration,
            transcriptionText: document.transcriptionText,
            captions: document.captions,
            captionLanguageCode: document.captionLanguageCode
        )
        HapticFeedback.success()
        teardown()
        onComplete(result)
    }

    // MARK: Rebuild

    private func scheduleRebuild() {
        rebuildTask?.cancel()
        rebuildTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(180))
            guard !Task.isCancelled, let self else { return }
            await self.rebuild(immediate: false)
        }
    }

    private func rebuild(immediate: Bool) async {
        rebuildGeneration += 1
        let generation = rebuildGeneration
        let snapshot = document
        do {
            let plan = try await VideoCompositionBuilder.build(document: snapshot)
            guard generation == rebuildGeneration else { return }
            let item = AVPlayerItem(asset: plan.composition)
            item.videoComposition = plan.videoComposition
            item.audioMix = plan.audioMix
            attachLoopObserver(to: item)
            let resume = min(playheadTime, max(0, snapshot.editedDuration - 0.05))
            player.replaceCurrentItem(with: item)
            player.seek(
                to: CMTime(seconds: resume, preferredTimescale: 600),
                toleranceBefore: .zero,
                toleranceAfter: .zero
            )
            if isPlaying && !isExporting { player.play() }
        } catch {
            guard generation == rebuildGeneration else { return }
            if !immediate { present(error) }
        }
    }

    private func installTimeObserver() {
        let interval = CMTime(seconds: 0.05, preferredTimescale: 600)
        timeObserver = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            let seconds = max(0, time.seconds)
            Task { @MainActor in self?.handleTimeUpdate(seconds) }
        }
    }

    private func handleTimeUpdate(_ seconds: Double) {
        guard !isScrubbing else { return }
        playheadTime = seconds
    }

    private func attachLoopObserver(to item: AVPlayerItem) {
        if let loopObserver { NotificationCenter.default.removeObserver(loopObserver) }
        loopObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: item,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.handlePlaybackEnded() }
        }
    }

    private func handlePlaybackEnded() {
        player.seek(to: .zero)
        if isPlaying && !isExporting {
            player.play()
        } else {
            isPlaying = false
        }
    }

    // MARK: Autosave

    private func scheduleAutosave() {
        autosaveTask?.cancel()
        let snapshot = document
        autosaveTask = Task {
            try? await Task.sleep(for: .seconds(1))
            guard !Task.isCancelled else { return }
            await VideoEditSessionStore.shared.save(snapshot)
        }
    }

    // MARK: Filmstrip

    private func loadFilmstrip() async {
        let frames = await VideoFrameExtractor.shared.extractFrames(
            objectId: "videoeditor:\(sourceURL.absoluteString)",
            url: sourceURL,
            maxFrames: 28
        )
        guard !frames.isEmpty else { return }
        filmstrip = frames
    }

    // MARK: Banners / errors

    private func present(_ error: Error) {
        present(message: message(for: error), isError: true)
    }

    private func present(message: String, isError: Bool) {
        banner = Banner(message: message, isError: isError)
    }

    private func message(for error: Error) -> String {
        if let editError = error as? VideoEditError {
            return editError.errorDescription ?? "Une erreur est survenue"
        }
        if let transcriptionError = error as? EdgeTranscriptionError {
            return transcriptionError.errorDescription ?? "Transcription indisponible"
        }
        return error.localizedDescription
    }
}
