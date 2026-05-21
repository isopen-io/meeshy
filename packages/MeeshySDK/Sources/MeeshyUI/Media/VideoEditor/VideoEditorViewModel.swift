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

    /// Waveform samples extracted **once** from the source asset's audio
    /// track at load time. Cached on disk + in-memory by `WaveformCache`,
    /// so the second open of the editor on the same file is free.
    /// Each entry is a normalised amplitude in `0...1`. Empty when the
    /// asset has no audio track (silent video).
    @Published public private(set) var audioWaveform: [Float] = []

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
        // SOTA setup pour un scrub local responsive : AVPlayer attend par
        // défaut que son buffer soit « confortable » avant de jouer/seek,
        // ce qui ajoute des hésitations sur un asset déjà entièrement local.
        // En éditeur, on ne tolère pas cette latence — la source est cached
        // sur disque, la latence de stalling est inutile.
        self.player.automaticallyWaitsToMinimizeStalling = false
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
        // L'extraction waveform tourne en parallèle de la filmstrip — les
        // deux pipelines lisent le même asset (frames vs samples audio)
        // mais via deux passes AVAssetReader disjointes.
        Task { [weak self] in await self?.loadAudioWaveform() }
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

    /// Seeks the preview player to `editedTime`.
    ///
    /// - Parameter precise: quand `true` (défaut), force `tolerance = .zero`
    ///   → AVPlayer décode exactement la frame cible (frame-accurate ; ce
    ///   qu'on veut pour un commit final ou un tap discret). Quand `false`,
    ///   on autorise une tolérance de ±33 ms (~2 frames @60fps) → AVPlayer
    ///   peut s'arrêter sur la keyframe la plus proche, **bien plus rapide**.
    ///   À utiliser pendant un drag de scrub où la latence batterie le ressenti.
    ///
    /// **Pourquoi ce double mode** — AVFoundation pénalise un seek
    /// `.zero/.zero` par un decode complet ; à 60 Hz de tick (notre
    /// `installTimeObserver`), le tube saturait facilement et la vidéo
    /// avait l'air en retard sur le doigt. Le SOTA des pro editors :
    /// preview tolerant pendant le drag, commit `.zero` au release.
    public func seek(to editedTime: Double, precise: Bool = true) {
        let clamped = min(max(0, editedTime), editedDuration)
        playheadTime = clamped
        let target = CMTime(seconds: clamped, preferredTimescale: 600)
        let tolerance: CMTime = precise
            ? .zero
            : CMTime(value: 33, timescale: 1000) // ~33 ms = 2 frames @ 60 fps
        player.seek(
            to: target,
            toleranceBefore: tolerance,
            toleranceAfter: tolerance
        )
    }

    public func beginScrub() {
        isScrubbing = true
        pause()
    }

    /// Live scrub pendant un drag — utilise le mode `precise: false` pour
    /// que le rendu suive le doigt sans jank. Le `endScrub()` fait un
    /// commit précis au release.
    public func scrub(toFraction fraction: Double) {
        seek(to: fraction * editedDuration, precise: false)
    }

    public func endScrub() {
        isScrubbing = false
        // Final commit : on re-seek à la position courante en mode précis
        // pour que le frame visible soit pixel-perfect à la position de la
        // tape (sinon le drag s'est arrêté entre 2 keyframes).
        seek(to: playheadTime, precise: true)
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
                // Pre-flight : vérifie que la source contient au moins une
                // piste audio. SFSpeech sur une vidéo muette retourne un
                // résultat vide qui flow ensuite vers `buildCaptions` —
                // celui-ci créerait un caption [0, editedDuration] avec
                // une chaîne vide qui apparaîtrait comme un sous-titre
                // fantôme à l'écran. Mieux : court-circuiter avec une
                // erreur typée que le banner peut afficher proprement.
                let asset = AVURLAsset(url: url)
                let audioTracks = try await asset.loadTracks(withMediaType: .audio)
                if audioTracks.isEmpty {
                    guard let self, !Task.isCancelled else { return }
                    self.transcription = .failed("Cette vidéo n'a pas de piste audio à transcrire.")
                    return
                }

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
        // Si la pre-flight a passé (piste audio présente) mais SFSpeech
        // n'a produit aucun segment exploitable (texte vide, signal trop
        // bruité…), on ne marque pas `.done` mais on retombe sur un
        // état d'erreur explicite. Sans ça, l'utilisateur ferait l'effort
        // de lancer la transcription pour ne RIEN voir apparaître.
        if captions.isEmpty &&
            result.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            transcription = .failed("Aucune parole détectée.")
            return
        }
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
            // SOTA : attendre que la VideoComposition rende la frame cible
            // AVANT de signaler `seek` complete. Sans ça, le seek résout
            // sur le frame brut de la composition (sans les CIFilters
            // appliqués) → l'image affiche un flash de la vidéo source
            // unfiltered avant le rendu CG. Avec ce flag, AVFoundation
            // pipeline la composition à travers le compositor avant resume.
            item.seekingWaitsForVideoCompositionRendering = true
            attachLoopObserver(to: item)
            let resume = min(playheadTime, max(0, snapshot.editedDuration - 0.05))
            player.replaceCurrentItem(with: item)
            await player.seek(
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
        // 16.67 ms ≈ 60 Hz. Avant, on tournait à 50 ms (20 Hz), ce qui
        // saccadait visiblement le filmstrip pendant la lecture (le
        // playhead est pinned au centre, donc c'est la BANDE qui glisse,
        // et 20 Hz produit des « sauts » de plusieurs pixels par tick).
        // À 60 Hz on glisse aussi vite que le compositor video sort des
        // frames — perceptuellement fluide.
        //
        // Sur ProMotion (120 Hz), AVFoundation peut quand même cantonner
        // les callbacks à ~60 Hz selon la charge — c'est un plafond, pas
        // un plancher. Le coût marginal vs 20 Hz est négligeable (un
        // dispatch main par frame, vs un toutes les 3 frames).
        let interval = CMTime(value: 1, timescale: 60)
        timeObserver = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            let seconds = max(0, time.seconds)
            Task { @MainActor in self?.handleTimeUpdate(seconds) }
        }
    }

    private func handleTimeUpdate(_ seconds: Double) {
        guard !isScrubbing else { return }
        // Diff-guard : ne pousse la valeur que si elle change réellement
        // (utile au tick d'enchaînement de seek où AVFoundation rappelle
        // parfois avec la même valeur, ce qui inflate les re-renders).
        guard abs(playheadTime - seconds) > 0.001 else { return }
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

    // MARK: Audio waveform

    /// Extracts the audio waveform from the source asset's audio track and
    /// caches it. The samples drive the waveform strip rendered under the
    /// filmstrip in `VideoEditorTimeline`.
    ///
    /// **Cache** — `WaveformCache` keys by filename + sample count, with
    /// L1 in-memory + L2 on-disk. Reopening the same file (composer
    /// re-entry, post-rebuild, etc.) returns the cached samples instantly
    /// without re-running the AVAssetReader pass.
    ///
    /// **Bar count** — 240 bars gives ~ 1 bar / 4 pt of timeline at the
    /// default zoom (a 12 s clip is ~ 700 pt wide). High enough to
    /// represent peaks without aliasing, low enough that the Canvas draw
    /// is essentially free.
    ///
    /// **Silent clips** — `WaveformCache.samples(from:)` returns `[]` if
    /// the asset has no audio track; the timeline renderer no-ops on that
    /// (early-return on `samples.isEmpty`) so the UI stays clean.
    private func loadAudioWaveform() async {
        guard let samples = try? await WaveformCache.shared.samples(
            from: sourceURL,
            count: 240
        ) else {
            return
        }
        audioWaveform = samples
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
