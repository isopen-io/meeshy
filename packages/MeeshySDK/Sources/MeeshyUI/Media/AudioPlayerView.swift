import SwiftUI
import AVFoundation
import Combine
import os
import UIKit
import MeeshySDK

// MARK: - Audio Playback Manager

@MainActor
public class AudioPlaybackManager: NSObject, ObservableObject {
    @Published public var isPlaying = false
    @Published public var progress: Double = 0
    @Published public var currentTime: TimeInterval = 0
    @Published public var duration: TimeInterval = 0
    @Published public var speed: PlaybackSpeed = .x1_0
    @Published public var isLoading = false

    public var onPlaybackFinished: (() -> Void)?

    /// BUG A (round 4) — opaque permission predicate consulted BEFORE any
    /// branch that *starts* or *resumes* playback (`play(urlString:)`,
    /// `playLocal(url:)`, the resume branch of `togglePlayPause()`). The SDK
    /// stays agnostic: it never imports app-side policy (e.g. `CallManager`).
    /// The app wires this to its CallKit guard so resuming a paused voice note
    /// during an active call — via the bubble tap, the lock-screen remote
    /// command, or any direct engine path — cannot steal the VoIP audio
    /// session. `nil` (default) means "always allowed". Returning `false`
    /// blocks ONLY start/resume; stop/pause are never gated.
    public var playbackPermissionGuard: (() -> Bool)?
    /// B3 fix — `@Published` so that observers (notably `AudioPlayerView` in
    /// the external-engine path) re-evaluate `handlePlayTap` gating logic
    /// the moment the coordinator swaps the loaded attachment. Without this,
    /// mutations stayed invisible to SwiftUI's dependency tracking and a
    /// rapid double-tap on the play button could resolve to a stale id.
    @Published public var attachmentId: String? {
        didSet {
            // Track switch (the shared engine is reassigned to a new audio
            // while the previous one is still loaded mid-playback): snapshot the
            // outgoing track's position so "resume where you stopped" survives
            // tapping another audio or skipping forward — not just pause/stop.
            guard oldValue != attachmentId, let outgoing = oldValue, player != nil else { return }
            saveResumePosition(currentTime, forAttachment: outgoing, totalDuration: duration)
        }
    }

    private var player: AVAudioPlayer?
    private var timer: Timer? {
        didSet { cleanupHandle.timer = timer }
    }
    private var loadTask: Task<Void, Never>? {
        didSet { cleanupHandle.loadTask = loadTask }
    }
    public private(set) var currentUrl: String?
    private var listenStartTime: Date?

    /// Unification Étape C (slice 4) — session routée via `MediaSessionCoordinator`
    /// (source unique, refcomptée, call-aware via l'Étape B) au lieu d'un
    /// `setCategory`/`setActive` direct. Flag idempotent : `play` ne libère pas
    /// (resetState) puis ré-acquiert (no-op si déjà tenue) → pas de churn ; seul
    /// `stop()` libère. ⚠️ Unifie le ducking : ce moteur posait `options: []`
    /// (PAS de duck) → désormais `[.duckOthers]` comme tous les autres players.
    private var sessionRequested = false {
        didSet { cleanupHandle.sessionRequested = sessionRequested }
    }

    /// Holds thread-safe-to-cancel handles (`Timer.invalidate()` /
    /// `Task.cancel()`) so `deinit` — which may run off the main thread — can
    /// release them WITHOUT `MainActor.assumeIsolated` (a precondition crash
    /// off-main, see lesson feedback_swift6_concurrency_pitfalls). Kept in
    /// sync with the @MainActor stored props via their `didSet`. Marked
    /// `nonisolated(unsafe)` because the contained operations are themselves
    /// thread-safe and we only ever cancel/invalidate from deinit.
    private final class CleanupHandle {
        nonisolated(unsafe) var timer: Timer?
        nonisolated(unsafe) var loadTask: Task<Void, Never>?
        nonisolated(unsafe) var sessionRequested = false
        /// Block-based `willResignActive` observer token. Removed in `deinit`
        /// (thread-safe) so the lifecycle hook never outlives the engine.
        nonisolated(unsafe) var lifecycleObserver: NSObjectProtocol?
    }
    private let cleanupHandle = CleanupHandle()

    public override init() {
        super.init()
        PlaybackCoordinator.shared.register(self)
        observeAppLifecycle()
    }

    /// Designated init that lets callers opt out of `PlaybackCoordinator`
    /// registration. The default `init()` keeps the historical
    /// auto-registration behavior (every call site that doesn't pass this
    /// new param stays unchanged). The opt-out is used by
    /// `AudioPlayerView` when a real external engine is provided, to avoid
    /// polluting the coordinator registry with an unused owned dummy whose
    /// only purpose is to satisfy SwiftUI's `@StateObject` lifetime.
    public init(registerWithCoordinator: Bool) {
        super.init()
        if registerWithCoordinator {
            PlaybackCoordinator.shared.register(self)
        }
        observeAppLifecycle()
    }

    /// Persists the current playback position when the app resigns active
    /// (incoming call, app switcher, lock, imminent termination). This is the
    /// belt that covers an app kill mid-playback — pause/stop already persist
    /// on their own paths. No-op for engines without a loaded `attachmentId`
    /// (preview/owned dummies).
    private func observeAppLifecycle() {
        cleanupHandle.lifecycleObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.willResignActiveNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.persistPosition() }
        }
    }

    // MARK: - Audio session (routed through the single MediaSessionCoordinator)

    /// Acquiert la session `.playback` via le coordinator (idempotent). Awaité
    /// DANS le `loadTask` AVANT `playData` → session active avant lecture, sans
    /// race. Call-aware (Étape B) : ne touche pas la session pendant un appel.
    private func acquireSession() async {
        guard !sessionRequested else { return }
        sessionRequested = true
        try? await MediaSessionCoordinator.shared.request(role: .playback)
    }

    /// Libère la session via le coordinator (refcompté : désactive au count 0).
    private func releaseSession() {
        guard sessionRequested else { return }
        sessionRequested = false
        Task { await MediaSessionCoordinator.shared.release() }
    }

    // MARK: - Play from remote URL (through cache)
    public func play(urlString: String) {
        if let guardClosure = playbackPermissionGuard, !guardClosure() { return }
        PlaybackCoordinator.shared.willStartPlaying(audio: self)
        resetState()
        guard !urlString.isEmpty else { return }
        currentUrl = urlString
        isLoading = true

        let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString

        loadTask = Task {
            await acquireSession()
            guard !Task.isCancelled else { return }
            do {
                let data = try await CacheCoordinator.shared.audio.data(for: resolved)
                guard !Task.isCancelled else { return }
                playData(data)
            } catch {
                Self.log.error("play(urlString) cache fetch echec (\(resolved, privacy: .public)): \(error.localizedDescription, privacy: .public)")
                isLoading = false
                // B5 fix — notify the parent (coordinator / autoplay registry)
                // that this audio is done so the queue can advance past the
                // broken head. Without this the queue stalled silently on
                // 404 / offline / malformed-URL failures. Safe to call
                // unconditionally from the catch branch: AVAudioPlayer was
                // never instantiated, so `handlePlaybackFinished` will not
                // fire later from `audioPlayerDidFinishPlaying`, ruling out
                // double advance.
                onPlaybackFinished?()
            }
        }
    }

    // MARK: - Play from local file
    public func playLocal(url: URL) {
        if let guardClosure = playbackPermissionGuard, !guardClosure() { return }
        PlaybackCoordinator.shared.willStartPlaying(audio: self)
        resetState()
        currentUrl = url.absoluteString
        // Pre-flight : vérifie l'existence du fichier AVANT d'ouvrir une
        // audio session. Sans ce check, `Data(contentsOf:)` jetait, le
        // `catch {}` historique avalait l'erreur, et le preview composer
        // restait silencieusement muet ("le bouton play ne joue rien").
        let fm = FileManager.default
        if url.isFileURL, !fm.fileExists(atPath: url.path) {
            Self.log.error("playLocal: fichier introuvable -> \(url.path, privacy: .public)")
            isLoading = false
            return
        }
        loadTask = Task {
            await acquireSession()
            guard !Task.isCancelled else { return }
            do {
                let data = try Data(contentsOf: url)
                playData(data)
            } catch {
                Self.log.error("playLocal echec (\(url.lastPathComponent, privacy: .public)): \(error.localizedDescription, privacy: .public)")
                isLoading = false
            }
        }
    }

    /// Logger dédié — `os.Logger` subsystem `me.meeshy.app`, catégorie
    /// `audio-playback`. Permet de filtrer rapidement dans Console.app
    /// quand un preview ne déclenche aucune lecture audible.
    private static let log = os.Logger(subsystem: "me.meeshy.app", category: "audio-playback")

    private func playData(_ data: Data) {
        do {
            player = try AVAudioPlayer(data: data)
            player?.delegate = self
            player?.enableRate = true
            player?.rate = Float(speed.rawValue)
            player?.prepareToPlay()
            duration = player?.duration ?? 0
            applyResumePositionIfAvailable()
            player?.play()
            isPlaying = true
            isLoading = false
            listenStartTime = Date()
            startProgressTimer()
        } catch {
            Self.log.error("playData AVAudioPlayer init echec (\(data.count, privacy: .public)o): \(error.localizedDescription, privacy: .public)")
            isLoading = false
        }
    }

    // MARK: - Controls
    private func resetState() {
        player?.stop()
        player = nil
        timer?.invalidate()
        timer = nil
        isPlaying = false
        progress = 0
        currentTime = 0
        // B2 fix — clear the listen analytics window so a fresh `play()` of a
        // different track does not inherit the prior track's start time and
        // post `reportListenProgress` against the wrong attachment. The new
        // track's `listenStartTime` is set in `playData(_:)` on actual start.
        listenStartTime = nil
        loadTask?.cancel()
        loadTask = nil
    }

    public func stop() {
        persistPosition()
        resetState()
        currentUrl = nil
        releaseSession()
    }

    public func togglePlayPause() {
        guard let player = player else { return }
        if player.isPlaying {
            player.pause()
            isPlaying = false
            timer?.invalidate()
            reportListenProgress(complete: false)
            persistPosition()
        } else {
            // BUG A (round 4) — gate ONLY the resume branch. Pausing is always
            // allowed; resuming during a call must not steal the VoIP session.
            if let guardClosure = playbackPermissionGuard, !guardClosure() { return }
            PlaybackCoordinator.shared.willStartPlaying(audio: self)
            player.rate = Float(speed.rawValue)
            player.play()
            isPlaying = true
            listenStartTime = listenStartTime ?? Date()
            startProgressTimer()
        }
    }

    public func seek(to fraction: Double) {
        guard let player = player else { return }
        let target = fraction * player.duration
        player.currentTime = target
        currentTime = target
        progress = fraction
    }

    public func seekToTime(_ time: Double) {
        guard let player = player, player.duration > 0 else { return }
        let fraction = time / player.duration
        seek(to: min(1, max(0, fraction)))
    }

    public func skip(seconds: Double) {
        guard let player = player else { return }
        let target = max(0, min(player.duration, player.currentTime + seconds))
        player.currentTime = target
        currentTime = target
        progress = player.duration > 0 ? target / player.duration : 0
    }

    public func setSpeed(_ newSpeed: PlaybackSpeed) {
        speed = newSpeed
        player?.rate = Float(speed.rawValue)
        HapticFeedback.light()
    }

    public func cycleSpeed() {
        setSpeed(speed.next())
    }

    // MARK: - Playback Finished (called by delegate)
    private func handlePlaybackFinished() {
        let finishedUrl = currentUrl
        reportListenProgress(complete: true)
        // Natural end → forget the saved RESUME position so a later re-listen
        // starts from 0, but remember the media as fully CONSUMED so the bubble
        // keeps tinting the waveform at rest.
        if let attId = attachmentId {
            MediaConsumptionStore.shared.record(fraction: 1, complete: true, for: attId)
            AudioPlaybackPositionStore.shared.clear(for: attId)
        }
        timer?.invalidate()
        timer = nil
        player = nil
        isPlaying = false
        progress = 0
        currentTime = 0
        listenStartTime = nil
        onPlaybackFinished?()
        if let url = finishedUrl {
            Self.triggerAutoplayNext(afterUrl: url)
        }
        currentUrl = nil
    }

    // MARK: - Listen Progress Reporting
    private func reportListenProgress(complete: Bool) {
        guard let attId = attachmentId else { return }
        guard let start = listenStartTime else { return }
        let listenedSeconds = Date().timeIntervalSince(start)
        guard complete || listenedSeconds >= 3 else { return }
        let positionMs = Int(currentTime * 1000)
        let totalDurationMs = Int(duration * 1000)

        Task {
            let body = AttachmentStatusBody(
                action: "listened",
                playPositionMs: positionMs,
                durationMs: totalDurationMs,
                complete: complete
            )
            let _: APIResponse<[String: String]>? = try? await APIClient.shared.post(
                endpoint: "/attachments/\(attId)/status",
                body: body
            )
        }
    }

    // MARK: - Playback position persistence
    //
    // Resume-where-you-stopped: a saved position is honored only when it sits
    // comfortably inside the track. We never resume within `resumeEdgeGuard`
    // of either edge — a position glued to 0 adds nothing, and one glued to
    // the end would replay the last instant then immediately finish.

    /// Tracks shorter than this are never resumed (a 1s voice note is replayed
    /// whole). Also gates `persistPosition` so we don't store noise.
    private static let minResumableDuration: TimeInterval = 2.0
    /// Dead-zone at both ends of the track, in seconds.
    private static let resumeEdgeGuard: TimeInterval = 1.0

    /// Seeks to the saved resume position (if any) BEFORE playback starts.
    /// Called from `playData(_:)` once `duration` is known and the player is
    /// prepared but not yet playing.
    private func applyResumePositionIfAvailable() {
        guard let attId = attachmentId,
              let player,
              duration >= Self.minResumableDuration,
              let saved = AudioPlaybackPositionStore.shared.position(for: attId),
              saved > Self.resumeEdgeGuard,
              saved < duration - Self.resumeEdgeGuard else { return }
        player.currentTime = saved
        currentTime = saved
        progress = duration > 0 ? saved / duration : 0
    }

    /// Persists the current elapsed time for the active attachment, or clears
    /// it when playback sits at either edge (nothing meaningful to resume).
    /// Safe no-op when no attachment is loaded.
    private func persistPosition() {
        guard let attId = attachmentId else { return }
        // Record the at-rest consumption fraction (monotonic) so a partially
        // listened voice note keeps its waveform tint after scroll / relaunch.
        if duration > 0 {
            MediaConsumptionStore.shared.record(fraction: currentTime / duration, complete: false, for: attId)
        }
        saveResumePosition(currentTime, forAttachment: attId, totalDuration: duration)
    }

    /// Saves `elapsed` as the resume point for `id`, or clears any stored
    /// position when `elapsed` sits at either edge of the track (nothing
    /// meaningful to resume). Short tracks are never stored.
    private func saveResumePosition(_ elapsed: TimeInterval, forAttachment id: String, totalDuration: TimeInterval) {
        guard totalDuration >= Self.minResumableDuration else { return }
        if elapsed > Self.resumeEdgeGuard && elapsed < totalDuration - Self.resumeEdgeGuard {
            AudioPlaybackPositionStore.shared.save(elapsed, for: id)
        } else {
            AudioPlaybackPositionStore.shared.clear(for: id)
        }
    }

    // MARK: - Timer
    //
    // Perf budget (2026-05-28): the previous 20 Hz tick (0.05 s) was the
    // single biggest CPU drain during sustained audio playback because
    // every wakeup re-published `currentTime` + `progress` through the
    // coordinator cascade → invalidated every `@ObservedObject coordinator`
    // observer (mini-player, etc.) at 20 Hz. Dropping to 10 Hz halves the
    // wakeups and is visually indistinguishable on the waveform / progress
    // chip (both round to 0.01-resolution display anyway). Additionally,
    // we skip writes whose delta is below a perceptible threshold to
    // collapse the Combine downstream into ~5 Hz of distinct values.
    private static let progressTickInterval: TimeInterval = 0.1
    /// `currentTime` is exposed in seconds with 100ms display granularity
    /// (`formatMediaDuration` truncates below that). Any smaller delta is
    /// invisible to the user and only generates wasted re-renders.
    private static let currentTimeWriteThresholdSeconds: TimeInterval = 0.05
    /// `progress` drives a 200-ish-pixel waveform; sub-half-pixel deltas
    /// yield no visible change. 0.002 (=0.2%) is a comfortable cutoff.
    private static let progressWriteThreshold: Double = 0.002

    private func startProgressTimer() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: Self.progressTickInterval, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self = self, let player = self.player else { return }
                guard player.isPlaying else { return }
                let newTime = player.currentTime
                let newProgress = player.duration > 0 ? newTime / player.duration : 0
                if abs(newTime - self.currentTime) >= Self.currentTimeWriteThresholdSeconds {
                    self.currentTime = newTime
                }
                if abs(newProgress - self.progress) >= Self.progressWriteThreshold {
                    self.progress = newProgress
                }
            }
        }
    }

    // C fix — `Timer.invalidate()` and `Task.cancel()` are thread-safe, so we
    // call them directly. `MainActor.assumeIsolated` from a non-main thread is
    // a precondition crash (see lesson feedback_swift6_concurrency_pitfalls:
    // @MainActor deinit pitfall) and the last release can happen off-main.
    deinit {
        cleanupHandle.timer?.invalidate()
        cleanupHandle.loadTask?.cancel()
        if let observer = cleanupHandle.lifecycleObserver {
            NotificationCenter.default.removeObserver(observer)
        }
        // Dealloc avec session encore tenue (chemin sans `stop()` — vue
        // détruite sans onDisappear) : sans cette libération le refcount du
        // MediaSessionCoordinator ne retombait jamais à 0 → session audio
        // active (ducking) pour tout le process et release() sous-compté.
        if cleanupHandle.sessionRequested {
            Task { await MediaSessionCoordinator.shared.release() }
        }
    }

    @MainActor public func unregisterFromCoordinator() {
        PlaybackCoordinator.shared.unregister(self)
    }

    // MARK: - Autoplay Registry (static)
    // Keyé par id d'attachement (stable) et non par URL : l'URL optimiste
    // `file://` est remplacée par l'URL serveur après upload — une entrée
    // enregistrée sous l'ancienne URL devenait introuvable au disappear et
    // retenait son moteur (closure forte) pour toute la vie du process. Le
    // déclenchement reste matché par URL (c'est celle que le player vient de
    // finir) ; une ré-apparition met l'entrée à jour via le dedupe par id.
    private static var autoplayRegistry: [(id: String, url: String, play: () -> Void)] = []

    public static func registerAutoplay(id: String, url: String, play: @escaping () -> Void) {
        autoplayRegistry.removeAll { $0.id == id }
        autoplayRegistry.append((id: id, url: url, play: play))
    }

    public static func unregisterAutoplay(id: String) {
        autoplayRegistry.removeAll { $0.id == id }
    }

    private static func triggerAutoplayNext(afterUrl: String) {
        guard let idx = autoplayRegistry.firstIndex(where: { $0.url == afterUrl }) else { return }
        let next = idx - 1
        guard next >= 0 else { return }
        autoplayRegistry[next].play()
    }
}

// MARK: - AVAudioPlayerDelegate
extension AudioPlaybackManager: AVAudioPlayerDelegate {
    nonisolated public func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            self.handlePlaybackFinished()
        }
    }
}

// MARK: - Audio Player View

extension AudioPlayerView {
    /// Pure helper testable : retourne la taille formatée (« 850 KB ») ou ""
    /// quand `fileSize` est 0 (inconnu).
    nonisolated public static func formattedNeedsDownloadLabel(fileSize: Int) -> String {
        guard fileSize > 0 else { return "" }
        return AudioPlayerView.formatBytes(Int64(fileSize))
    }

    /// Pure helper testable : retourne « 398 KB / 850 KB » ou un fallback
    /// quand un des deux côtés est inconnu.
    nonisolated public static func formattedDownloadingLabel(
        downloadedBytes: Int64,
        totalBytes: Int64,
        fallbackFileSize: Int
    ) -> String {
        let total: Int64 = totalBytes > 0 ? totalBytes : Int64(fallbackFileSize)
        if total <= 0 && downloadedBytes <= 0 { return "" }
        let left = AudioPlayerView.formatBytes(downloadedBytes)
        let right = total > 0 ? AudioPlayerView.formatBytes(total) : "?"
        return "\(left) / \(right)"
    }

    /// Delegates to the single SDK-wide `formatMediaFileSize` helper so the
    /// audio play-button label, the download badges (image/video) and the
    /// upload progress bar always render the exact same string for the same
    /// byte count. Previously this used its own binary (1024-based)
    /// `ByteCountFormatter` while the app's `AttachmentDownloader.fmt` used a
    /// decimal (1000-based) one — despite a comment claiming they matched.
    nonisolated public static func formatBytes(_ bytes: Int64) -> String {
        formatMediaFileSize(bytes)
    }
}

public struct AudioPlayerView: View {
    public let attachment: MeeshyMessageAttachment
    public let context: MediaPlayerContext

    public var accentColor: String = MeeshyColors.brandPrimaryHex
    public var transcription: MessageTranscription? = nil
    public var translatedAudios: [MessageTranslatedAudio] = []

    public var onFullscreen: (() -> Void)? = nil
    public var onRequestTranscription: (() -> Void)? = nil
    public var onRetranscribe: (() -> Void)? = nil
    public var onDelete: (() -> Void)? = nil
    public var onEdit: (() -> Void)? = nil
    public var onPlayingChange: ((Bool) -> Void)? = nil
    /// Optional play-tap router for callers that own the playback engine and
    /// the audio queue (e.g. a `ConversationAudioCoordinator`). When provided,
    /// taps on the play button delegate to this closure as long as the
    /// underlying engine isn't already loaded with THIS attachment — i.e. as
    /// long as starting playback for this bubble requires the parent to set
    /// up the queue / active-context first. Once the engine is loaded
    /// (`player.attachmentId == attachment.id`), play/pause routes through
    /// the engine directly so subsequent toggles are instantaneous and don't
    /// rebuild the queue. Backward-compat: when nil, behavior is unchanged.
    private var onPlayRequest: (() -> Void)? = nil
    private var externalLanguage: Binding<String?>?
    private var topSlot: AnyView?
    private var bottomSlot: AnyView?
    private var availability: AudioAvailability
    private var onDownload: (() -> Void)?

    // Owned-by-default engine. Created once per view lifetime via
    // `@StateObject`. When the caller injects an `externalPlayer`, this
    // owned instance stays inert (no audio session, never asked to play).
    // We opt it out of `PlaybackCoordinator` registration in that case
    // to keep the registry clean — see `AudioPlaybackManager.init(registerWithCoordinator:)`.
    @StateObject private var ownedPlayer: AudioPlaybackManager
    @StateObject private var waveformAnalyzer = AudioWaveformAnalyzer()
    // External engine, when provided by a parent coordinator. Wrapping it
    // in `@ObservedObject` is required so SwiftUI re-renders the body on
    // `@Published` changes coming from the externally-owned engine.
    // When `externalPlayer == nil`, this wraps a shared no-op singleton
    // (`AudioPlayerView.sharedNoopExternal`) — its mutations are never
    // observed because the computed `player` falls back to `ownedPlayer`,
    // and the static identity avoids per-init churn.
    @ObservedObject private var observedExternalPlayer: AudioPlaybackManager
    // Internal (not `private`) so `@testable import` can observe the
    // resolution decision from MeeshyUITests without exposing it publicly.
    internal let usesExternalPlayer: Bool

    /// Engine actually driving playback / observed by the body. Resolves to
    /// `observedExternalPlayer` when an external engine was injected, else
    /// to `ownedPlayer`. Both are observed via property wrappers, so any
    /// `@Published` mutation on the resolved engine re-renders the view.
    private var player: AudioPlaybackManager {
        usesExternalPlayer ? observedExternalPlayer : ownedPlayer
    }

    /// Shared no-op engine used as the `observedExternalPlayer` placeholder
    /// whenever the caller did not inject an external engine. It is never
    /// asked to play and is intentionally NOT registered with
    /// `PlaybackCoordinator`. Using a single shared identity avoids
    /// allocating one throwaway `AudioPlaybackManager` per view init.
    @MainActor
    private static let sharedNoopExternal = AudioPlaybackManager(registerWithCoordinator: false)

    // Leaf view rendered once per audio bubble — observing the ThemeManager
    // singleton via @ObservedObject here would invalidate EVERY audio bubble
    // on screen on every theme publish (Zero Unnecessary Re-render,
    // CLAUDE.md). `colorScheme` is the blessed leaf-view alternative for a
    // simple dark/light read; ThemeManager.mode itself is kept in sync with
    // it (see `ThemeManager.syncWithSystem`).
    @Environment(\.colorScheme) private var colorScheme
    @State private var isTranscriptionExpanded = false
    @State private var selectedAudioLanguage: String = "orig"
    @State private var isRetranscribing = false
    /// `true` between the moment the user taps "Transcrire" / "Re-transcrire"
    /// and the moment the server-pushed transcription lands in `transcription`.
    /// Drives the shimmer skeleton in `transcriptionBlock`.
    @State private var isTranscribing = false
    /// Toggled in `onAppear` of the skeleton view to drive the pulse.
    @State private var transcriptionPulsePhase = false
    /// `true` pendant le drag de scrub sur la waveform. Publié via
    /// `MediaScrubbingPreferenceKey` pour que l'hôte (conteneur de swipe de
    /// bulle côté app) désengage ses gestes horizontaux le temps du scrub.
    /// `@GestureState` (pas `@State`) : SwiftUI le remet à `false`
    /// automatiquement si le drag est interrompu (appel entrant, arbitrage
    /// perdu face au parent) même quand `.onEnded` ne se déclenche jamais —
    /// un `@State` manuel resterait bloqué à `true` et désengagerait le swipe
    /// reply/forward de la bulle indéfiniment.
    @GestureState private var isUserScrubbing = false

    private var isDark: Bool { colorScheme == .dark || context.isImmersive }
    private var accent: Color { Color(hex: accentColor) }

    private var displaySegments: [TranscriptionDisplaySegment] {
        AudioPlayerView.resolveDisplaySegments(
            selectedLanguage: selectedAudioLanguage,
            transcription: transcription,
            translatedAudios: translatedAudios
        )
    }

    /// Pure resolution of the transcription strip segments. Falls back to a
    /// single synthesized segment from the full text when the per-segment
    /// list is empty — symmetrically for the original transcription AND for a
    /// selected translated audio (otherwise stub-segment translated audios
    /// would render a blank strip).
    nonisolated public static func resolveDisplaySegments(
        selectedLanguage: String,
        transcription: MessageTranscription?,
        translatedAudios: [MessageTranslatedAudio]
    ) -> [TranscriptionDisplaySegment] {
        if selectedLanguage != "orig",
           let translated = translatedAudios.first(where: {
               $0.targetLanguage.lowercased() == selectedLanguage.lowercased()
           }) {
            let builtTranslated = TranscriptionDisplaySegment.buildFrom(segments: translated.segments)
            if builtTranslated.isEmpty,
               !translated.transcription.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return [TranscriptionDisplaySegment(
                    text: translated.transcription,
                    startTime: 0,
                    endTime: Double(translated.durationMs) / 1000.0,
                    speakerId: nil,
                    speakerColor: TranscriptionDisplaySegment.speakerPalette[0]
                )]
            }
            return builtTranslated
        }
        guard let t = transcription else { return [] }
        let built = TranscriptionDisplaySegment.buildFrom(t)
        if built.isEmpty, !t.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return [TranscriptionDisplaySegment(
                text: t.text,
                startTime: 0,
                endTime: Double(t.durationMs ?? 0) / 1000.0,
                speakerId: nil,
                speakerColor: TranscriptionDisplaySegment.speakerPalette[0]
            )]
        }
        return built
    }

    private var estimatedDuration: TimeInterval {
        let metadata = Double(attachment.duration ?? 0) / 1000.0
        if metadata > 0 { return metadata }
        return player.duration
    }

    public init<TopContent: View, BottomContent: View>(
        attachment: MeeshyMessageAttachment, context: MediaPlayerContext,
        accentColor: String = MeeshyColors.brandPrimaryHex, transcription: MessageTranscription? = nil,
        translatedAudios: [MessageTranslatedAudio] = [],
        onFullscreen: (() -> Void)? = nil,
        onRequestTranscription: (() -> Void)? = nil,
        onRetranscribe: (() -> Void)? = nil,
        onDelete: (() -> Void)? = nil, onEdit: (() -> Void)? = nil,
        onPlayingChange: ((Bool) -> Void)? = nil,
        externalLanguage: Binding<String?>? = nil,
        availability: AudioAvailability = .ready,
        onDownload: (() -> Void)? = nil,
        externalPlayer: AudioPlaybackManager? = nil,
        onPlayRequest: (() -> Void)? = nil,
        @ViewBuilder topContent: () -> TopContent = { EmptyView() },
        @ViewBuilder bottomContent: () -> BottomContent = { EmptyView() }
    ) {
        self.attachment = attachment; self.context = context; self.accentColor = accentColor
        self.transcription = transcription; self.translatedAudios = translatedAudios
        self.onFullscreen = onFullscreen; self.onRequestTranscription = onRequestTranscription
        self.onRetranscribe = onRetranscribe
        self.onDelete = onDelete; self.onEdit = onEdit
        self.onPlayingChange = onPlayingChange
        self.onPlayRequest = onPlayRequest
        self.externalLanguage = externalLanguage
        self.availability = availability
        self.onDownload = onDownload
        // External engine wiring. When the caller passes an externally-owned
        // `AudioPlaybackManager` (e.g. a ConversationAudioCoordinator that
        // survives view hierarchy churn), the view observes THAT engine
        // and never touches its owned dummy. The dummy `ownedPlayer` is
        // still created (SwiftUI demands a non-optional `@StateObject`
        // initial value) but we opt it out of `PlaybackCoordinator` to
        // avoid polluting the registry with an unused weak reference.
        let usesExternal = externalPlayer != nil
        self.usesExternalPlayer = usesExternal
        self._ownedPlayer = StateObject(
            wrappedValue: AudioPlaybackManager(registerWithCoordinator: !usesExternal)
        )
        self._observedExternalPlayer = ObservedObject(
            wrappedValue: externalPlayer ?? AudioPlayerView.sharedNoopExternal
        )
        let top = topContent()
        self.topSlot = top is EmptyView ? nil : AnyView(top)
        let bottom = bottomContent()
        self.bottomSlot = bottom is EmptyView ? nil : AnyView(bottom)
    }

    private var fullTranscriptionText: String {
        displaySegments.map(\.text).joined(separator: " ")
    }

    private var isLongTranscription: Bool {
        fullTranscriptionText.count > 255
    }

    // MARK: - Body
    public var body: some View {
        VStack(spacing: 0) {
            mainPlayer

            if !translatedAudios.isEmpty && !context.isCompact {
                languageSelector
                    .padding(.top, 6)
                    .transition(.opacity)
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isTranscriptionExpanded)
        .onAppear {
            // CRITICAL: when an external engine is injected, the parent owns
            // `attachmentId` (it tracks which audio the shared engine is
            // currently loaded with). Overwriting it here would clobber that
            // tracking the moment a second audio bubble appears on-screen
            // while another is playing — breaking the `handlePlayTap`
            // gate that relies on `player.attachmentId == attachment.id` to
            // decide between "route to parent" vs "toggle play/pause".
            if !usesExternalPlayer {
                player.attachmentId = attachment.id
            }
            // BUG A fix — the legacy static autoplay registry is the
            // auto-advance mechanism ONLY for the owned-engine path. When an
            // external coordinator engine drives this view, the coordinator
            // queue is the single source of auto-advance (`advanceQueue`).
            // Registering here would make the registry stomp the coordinator's
            // next head after a track finishes (double auto-advance → wrong
            // track plays). Gate registration on `!usesExternalPlayer` so the
            // two mechanisms never co-drive the same engine. Unregistration in
            // `onDisappear` is gated symmetrically.
            if !usesExternalPlayer {
                let autoplayUrl = attachment.fileUrl
                // Capture weak en défense : la closure vit dans un registre
                // STATIQUE — une entrée orpheline ne doit pas retenir le moteur.
                AudioPlaybackManager.registerAutoplay(id: attachment.id, url: autoplayUrl) { [weak player] in
                    guard let player else { return }
                    // Optimistic local audio can never load through the cache
                    // (DiskCacheStore.data(for:) rejects file://) — autoplay it
                    // straight from disk. See Sprint 3 RC3.2.
                    if autoplayUrl.hasPrefix("file://"), let localURL = URL(string: autoplayUrl) {
                        player.playLocal(url: localURL)
                    } else {
                        player.play(urlString: autoplayUrl)
                    }
                }
            }
            loadWaveformSamples()
        }
        .onDisappear {
            // Owned-engine teardown. The external-engine path (conversation
            // bubbles) is owned by a parent coordinator that survives view
            // hierarchy churn and intentionally keeps playing via the
            // mini-player + background continuation, so it must be left
            // untouched here.
            guard Self.shouldStopOwnedEngineOnDisappear(usesExternalPlayer: usesExternalPlayer) else { return }
            // Symmetrical to onAppear (BUG A fix): the legacy autoplay closure
            // is registered only in the owned-engine path. Désenregistré par
            // id : `attachment.fileUrl` peut avoir changé entre appear et
            // disappear (swap URL optimiste → serveur), l'id est stable.
            AudioPlaybackManager.unregisterAutoplay(id: attachment.id)
            // Leak fix — stop owned playback deterministically. Relying on ARC
            // to dealloc the `@StateObject` is non-deterministic, and once the
            // engine is unregistered from `PlaybackCoordinator` (next line) it
            // can no longer be silenced when a story or conversation claims
            // audio next — so post / feed-card audio would keep playing on top
            // of the next screen (e.g. bleed over a story). Stop BEFORE
            // unregistering so the audio is actually halted.
            player.stop()
            player.unregisterFromCoordinator()
        }
        .adaptiveOnChange(of: player.isPlaying) { _, playing in
            onPlayingChange?(playing)
            if playing { loadWaveformSamples() }
        }
        .adaptiveOnChange(of: externalLanguage?.wrappedValue) { _, newLang in
            let code = newLang ?? "orig"
            guard code != selectedAudioLanguage else { return }
            switchToLanguage(code)
        }
        // Reset the in-flight flags as soon as a fresh transcription lands.
        // Drives the fluid skeleton → text transition: the shimmer fades out
        // and the transcribed segments fade in within the same animation
        // window thanks to the `.transition(.opacity)` on each branch of
        // `transcriptionBlock`. Uses the SDK-wide `adaptiveOnChange` compat
        // shim so the iOS 17 two-param closure shape works back to iOS 16.
        .adaptiveOnChange(of: transcription) { _, newValue in
            if newValue != nil {
                withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                    isTranscribing = false
                    isRetranscribing = false
                }
            }
        }
    }

    private func switchToLanguage(_ code: String) {
        // Bug §1.1 fix: stop playback immediately instead of calling
        // player.play(urlString:) directly on the new language URL.
        // The previous behavior bypassed the availability gate, silently
        // streaming the translated audio when it wasn't cached. The parent
        // (AudioMediaView via the externalLanguage binding) re-resolves
        // availability for the new URL and triggers auto-DL (if policy
        // permits) or shows the download button. The user re-taps play,
        // which goes through handlePlayTap() — gated by availability.
        player.stop()

        withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
            selectedAudioLanguage = code
        }
    }

    // MARK: - Main Player
    /// Empile, dans cet ordre strict :
    /// 1. `topSlot` (reply) + son séparateur quand il existe
    /// 2. Les contrôles du player (play / waveform / time)
    /// 3. Le bloc de transcription (texte ou bouton "Transcrire") sans footer
    /// 4. `bottomSlot` (footer) ancré tout en bas, séparé par un unique
    ///    `Divider` quand quelque chose précède
    ///
    /// Cette structure garantit que `BubbleFooter` (timestamp + read receipts)
    /// reste toujours sous le player, jamais incrusté entre la transcription
    /// et le bouton "Re-transcrire" comme c'était le cas avant ce refactor.
    private var mainPlayer: some View {
        VStack(spacing: 0) {
            if let slot = topSlot {
                slot
                slotDivider
            }

            HStack(alignment: .center, spacing: context.isCompact ? 8 : 10) {
                playButton
                VStack(alignment: .leading, spacing: context.isCompact ? 3 : 4) {
                    waveformProgress
                    timeRow
                }
                rightChipsColumn
                contextActions
            }
            .padding(.horizontal, context.isCompact ? 10 : 14)
            .padding(.vertical, context.isCompact ? 8 : 12)

            transcriptionBlock

            if let slot = bottomSlot {
                slotDivider
                slot
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
            }
        }
        .background(playerBackground)
    }

    /// Trait subtil utilisé entre les sections du player. Un seul style,
    /// instancié là où il sépare effectivement deux contenus, jamais en
    /// cascade.
    private var slotDivider: some View {
        Divider()
            .background(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.06))
    }

    /// Bloc de transcription : trois états mutuellement exclusifs (transition
    /// animée par `withAnimation` sur les state changes) :
    /// 1. `isTranscribing && displaySegments.isEmpty` → shimmer skeleton
    ///    (3 lignes qui pulsent) — montre que la requête est en vol.
    /// 2. `!displaySegments.isEmpty` → texte transcrit + bouton "Re-transcrire".
    /// 3. `onRequestTranscription != nil` → bouton "Transcrire" initial.
    ///
    /// `isTranscribing` est reset automatiquement par `.onChange(of: transcription)`
    /// quand la transcription arrive du serveur, ce qui déclenche la transition
    /// fluide skeleton → texte sans flash intermédiaire.
    /// **Ne rend jamais le `bottomSlot`** — il est ancré par `mainPlayer`.
    @ViewBuilder
    private var transcriptionBlock: some View {
        if isTranscribing && displaySegments.isEmpty {
            VStack(spacing: 0) {
                slotDivider
                transcriptionShimmer
            }
            .padding(.bottom, 6)
            .transition(.opacity)
        } else if !displaySegments.isEmpty {
            VStack(spacing: 0) {
                slotDivider

                let segments = isLongTranscription && !isTranscriptionExpanded
                    ? truncatedSegments
                    : displaySegments

                inlineFlowTranscription(segments: segments)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)

                if isLongTranscription {
                    expandToggleButton
                }
                retranscribeButton
            }
            .padding(.bottom, 6)
            .transition(.opacity)
        } else if let onRequest = onRequestTranscription {
            // No transcription yet AND none in flight: ONLY the initial
            // "Transcribe" affordance is shown. Re-transcribe is hidden
            // here — there is nothing to re-transcribe yet, and stacking
            // both buttons would be confusing. The "Re-transcribe" CTA
            // reappears in the transcription-present branch above once a
            // transcription lands.
            VStack(spacing: 0) {
                slotDivider

                Button {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                        isTranscribing = true
                    }
                    onRequest()
                    HapticFeedback.light()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "text.badge.plus")
                            .font(.system(size: 10, weight: .medium))
                        Text(String(localized: "media.audio.transcribe", defaultValue: "Transcrire", bundle: .module))
                            .font(.system(size: 10, weight: .medium))
                    }
                    .foregroundColor(isDark ? .white.opacity(0.45) : .black.opacity(0.35))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                }
            }
            .transition(.opacity)
        }
    }

    /// Shimmer placeholder displayed while a transcription request is in flight.
    /// Three rounded lines (the third truncated to ~120pt) pulse opacity in
    /// sync. Pure SwiftUI, iOS 16+ compatible. The pulse is driven by a
    /// `@State` flipped in `onAppear` so it starts immediately on mount.
    @ViewBuilder
    private var transcriptionShimmer: some View {
        let lineColor: Color = isDark ? Color.white.opacity(0.10) : Color.black.opacity(0.08)
        VStack(alignment: .leading, spacing: 6) {
            shimmerLine(color: lineColor, width: nil)
            shimmerLine(color: lineColor, width: nil)
            shimmerLine(color: lineColor, width: 120)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .opacity(transcriptionPulsePhase ? 0.55 : 1.0)
        .animation(
            .easeInOut(duration: 0.9).repeatForever(autoreverses: true),
            value: transcriptionPulsePhase
        )
        .onAppear { transcriptionPulsePhase = true }
        .onDisappear { transcriptionPulsePhase = false }
        .accessibilityLabel(Text(String(
            localized: "media.audio.transcribing",
            defaultValue: "Transcription en cours",
            bundle: .module
        )))
    }

    private func shimmerLine(color: Color, width: CGFloat?) -> some View {
        RoundedRectangle(cornerRadius: 4)
            .fill(color)
            .frame(width: width, height: 9)
            .frame(maxWidth: width == nil ? .infinity : nil, alignment: .leading)
    }

    // MARK: - Long-transcription chevron toggle
    @ViewBuilder
    private var expandToggleButton: some View {
        Button {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                isTranscriptionExpanded.toggle()
            }
            HapticFeedback.light()
        } label: {
            Image(systemName: isTranscriptionExpanded ? "chevron.up" : "chevron.down")
                .font(.system(size: 9, weight: .bold))
                .foregroundColor(isDark ? .white.opacity(0.35) : .black.opacity(0.25))
                .frame(maxWidth: .infinity)
                .frame(height: 20)
        }
    }

    // MARK: - Re-transcribe Button
    @ViewBuilder
    private var retranscribeButton: some View {
        if let onRetranscribe {
            Button {
                guard !isRetranscribing else { return }
                isRetranscribing = true
                onRetranscribe()
                HapticFeedback.light()
            } label: {
                HStack(spacing: 4) {
                    if isRetranscribing {
                        ProgressView().scaleEffect(0.6)
                    } else {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 10, weight: .medium))
                    }
                    Text(String(localized: "media.audio.retranscribe",
                                 defaultValue: "Re-transcrire", bundle: .module))
                        .font(.system(size: 10, weight: .medium))
                }
                .foregroundColor(isDark ? .white.opacity(0.45) : .black.opacity(0.35))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
            }
            .disabled(isRetranscribing)
        }
    }

    private var truncatedSegments: [TranscriptionDisplaySegment] {
        var charCount = 0
        var result: [TranscriptionDisplaySegment] = []
        for segment in displaySegments {
            charCount += segment.text.count
            if charCount > 255 {
                let overflow = charCount - 255
                let trimmed = String(segment.text.dropLast(overflow))
                if !trimmed.isEmpty {
                    result.append(TranscriptionDisplaySegment(
                        text: trimmed + "...",
                        startTime: segment.startTime,
                        endTime: segment.endTime,
                        speakerId: segment.speakerId,
                        speakerColor: segment.speakerColor
                    ))
                }
                break
            }
            result.append(segment)
        }
        return result
    }

    /// Index du segment de transcription en cours de lecture (karaoké), résolu
    /// depuis l'état live du moteur. Délègue au helper pur testable ci-dessous.
    private func activeTranscriptionIndex(in segments: [TranscriptionDisplaySegment]) -> Int? {
        Self.activeSegmentIndex(
            segments: segments,
            currentTime: player.currentTime,
            progress: player.progress,
            isPlaying: player.isPlaying
        )
    }

    /// Index du segment actif à un instant donné — fonction PURE (testable).
    ///
    /// Utilise les timestamps réels dès qu'au moins un segment en porte un valide
    /// (`endTime > startTime`). Quand la transcription n'a AUCUNE découpe temporelle
    /// — segments à `startTime == endTime == 0`, fréquent sur les audios transcrits
    /// sans alignement mot-à-mot — le prédicat `currentTime < endTime` resterait
    /// toujours faux et plus AUCUN segment ne s'allumerait (tout gris, désynchronisé).
    /// On retombe alors sur une progression proportionnelle pilotée par `progress`
    /// pour que le surlignage avance quand même avec la lecture. `nil` à l'arrêt.
    nonisolated public static func activeSegmentIndex(
        segments: [TranscriptionDisplaySegment],
        currentTime: TimeInterval,
        progress: Double,
        isPlaying: Bool
    ) -> Int? {
        guard isPlaying, !segments.isEmpty else { return nil }
        if segments.contains(where: { $0.endTime > $0.startTime }) {
            return segments.firstIndex { currentTime >= $0.startTime && currentTime < $0.endTime }
        }
        let idx = Int(progress * Double(segments.count))
        return min(max(idx, 0), segments.count - 1)
    }

    @ViewBuilder
    private func inlineFlowTranscription(segments: [TranscriptionDisplaySegment]) -> some View {
        // Cas fallback synthesized : `resolveDisplaySegments` renvoie un
        // unique segment qui porte tout le texte quand la transcription n'a
        // pas de découpe par segment (audio sans segments structurés).
        // `FlowLayout` propose `.unspecified` à chaque subview, qui retourne
        // alors sa largeur native une-ligne — un seul Button énorme ne peut
        // donc plus être wrappé et le texte est tronqué visuellement.
        // On rend directement un Text qui wrap naturellement dans ce cas.
        // La couleur suit le même contrat que les segments multiples :
        // idle (avant), actif (pendant lecture), past (après) — pour qu'un
        // audio sans segments soit aussi lisible pendant la lecture.
        if segments.count == 1, let single = segments.first {
            // Activité résolue par le helper partagé : timing réel si disponible,
            // sinon proportionnel (un segment unique non-timé reste actif toute la
            // lecture au lieu de ne jamais s'allumer faute de `endTime`).
            let isActive = activeTranscriptionIndex(in: segments) == 0
            let hasRealTiming = single.endTime > single.startTime
            let isPast = !isActive && (hasRealTiming
                ? player.currentTime >= single.endTime
                : (!player.isPlaying && player.progress >= 0.999))
            Button {
                player.seekToTime(single.startTime)
                HapticFeedback.light()
            } label: {
                Text(single.text)
                    .font(.system(size: 13, weight: isActive ? .bold : .regular))
                    .foregroundColor(inlineSegmentColor(isActive: isActive, isPast: isPast))
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, isActive ? 2 : 0)
                    .padding(.vertical, isActive ? 1 : 0)
                    .background(
                        RoundedRectangle(cornerRadius: 4)
                            .fill(Color(hex: accentColor).opacity(isActive ? 0.12 : 0))
                    )
            }
            .buttonStyle(.plain)
            .animation(.easeInOut(duration: 0.15), value: isActive)
            .animation(.easeInOut(duration: 0.15), value: isPast)
        } else {
            // Activité résolue par le helper partagé : timing réel quand au moins un
            // segment en porte, sinon fallback proportionnel sur `player.progress`
            // (transcription sans découpe temporelle → karaoké quand même synchronisé).
            // Gate sur `isPlaying` conservé (BUG D : sur une page carousel idle,
            // `currentTime == 0` + segment 0 à `startTime == 0` faussait l'allumage).
            let activeIdx = activeTranscriptionIndex(in: segments)
            FlowLayout(spacing: 0) {
                ForEach(Array(segments.enumerated()), id: \.element.id) { index, segment in
                    let isActive = index == activeIdx
                    let isPast = activeIdx != nil && index < activeIdx!

                    Button {
                        player.seekToTime(segment.startTime)
                        HapticFeedback.light()
                    } label: {
                        Text(segment.text + " ")
                            .font(.system(size: 13, weight: isActive ? .bold : .regular))
                            .foregroundColor(inlineSegmentColor(isActive: isActive, isPast: isPast))
                            .padding(.horizontal, isActive ? 2 : 0)
                            .padding(.vertical, isActive ? 1 : 0)
                            .background(
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(Color(hex: accentColor).opacity(isActive ? 0.12 : 0))
                            )
                    }
                    .buttonStyle(.plain)
                    .animation(.easeInOut(duration: 0.15), value: isActive)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func inlineSegmentColor(isActive: Bool, isPast: Bool) -> Color {
        if isActive { return Color(hex: accentColor) }
        if isPast { return isDark ? Color.white.opacity(0.7) : Color.black.opacity(0.6) }
        return isDark ? Color.white.opacity(0.35) : Color.black.opacity(0.25)
    }

    private var currentAudioUrl: String {
        if selectedAudioLanguage != "orig",
           let translated = translatedAudios.first(where: { $0.targetLanguage.lowercased() == selectedAudioLanguage.lowercased() }) {
            return translated.url
        }
        return attachment.fileUrl
    }

    // MARK: - Play Button
    private var playButton: some View {
        Button {
            switch availability {
            case .ready:
                handlePlayTap()
            case .needsDownload:
                onDownload?()
                HapticFeedback.light()
            case .downloading:
                break
            }
        } label: {
            playButtonLabel
        }
        .disabled(isDownloading)
        .accessibilityLabel(String(localized: "media.audio.play", defaultValue: "Lire l'audio", bundle: .module))
    }

    private var isDownloading: Bool {
        if case .downloading = availability { return true }
        return false
    }

    /// Pure routing decision used by `handlePlayTap`. Extracted as a
    /// `nonisolated static` helper so it can be unit-tested without a
    /// SwiftUI render lifecycle. Returns `true` iff the play tap should be
    /// delegated to `onPlayRequest` instead of touching the locally
    /// resolved `player`.
    nonisolated internal static func shouldDelegateToParent(
        usesExternalPlayer: Bool,
        playerAttachmentId: String?,
        bubbleAttachmentId: String
    ) -> Bool {
        if !usesExternalPlayer { return true }
        return playerAttachmentId != bubbleAttachmentId
    }

    /// Pure decision: should the owned playback engine be stopped when this
    /// view leaves the hierarchy? `true` only for the owned-engine path (post
    /// detail, feed post cards, composer preview, standalone players). An
    /// externally-injected engine (e.g. `ConversationAudioCoordinator`) is
    /// owned by a parent that survives view churn and intentionally keeps
    /// playing (mini-player + background continuation), so it must NOT be
    /// stopped here. Extracted as a `nonisolated static` so the lifecycle
    /// contract is unit-testable without a SwiftUI render lifecycle.
    nonisolated internal static func shouldStopOwnedEngineOnDisappear(usesExternalPlayer: Bool) -> Bool {
        !usesExternalPlayer
    }

    private func handlePlayTap() {
        // External-engine interception: when the parent injected an
        // `onPlayRequest` handler, defer to it so the parent can set up the
        // queue / active-context BEFORE asking the engine to play. Two
        // cases short-circuit to the parent:
        //  1. The bubble is INACTIVE (`!usesExternalPlayer`) — its
        //     `ownedPlayer` is a dummy that must never produce sound. Even
        //     though `onAppear` writes `player.attachmentId = attachment.id`
        //     on the owned dummy (so other readers can introspect it), that
        //     local match must NOT be used to gate the routing — otherwise
        //     the first tap on every fresh bubble bypasses the coordinator
        //     and plays via the dummy local engine, leaving `activeContext`
        //     nil. That broke the mini-player + background continuation
        //     (cf. 2026-05-28 bug report).
        //  2. The bubble is ACTIVE but the shared engine is loaded with a
        //     DIFFERENT attachment (`player.attachmentId != attachment.id`)
        //     — the parent must rebuild the queue around this audio.
        // Once the external engine IS loaded with this attachment, fall
        // through to `togglePlayPause()` so subsequent play/pause taps are
        // instantaneous and never rebuild the queue.
        if let onPlayRequest, Self.shouldDelegateToParent(
            usesExternalPlayer: usesExternalPlayer,
            playerAttachmentId: player.attachmentId,
            bubbleAttachmentId: attachment.id
        ) {
            onPlayRequest()
            HapticFeedback.light()
            return
        }
        if player.isPlaying || player.progress > 0 {
            player.togglePlayPause()
        } else if attachment.fileUrl.hasPrefix("file://"),
                  let localURL = URL(string: attachment.fileUrl) {
            // Optimistic local audio: AudioPlaybackManager.play(urlString:)
            // routes through DiskCacheStore.data(for:), which rejects
            // file:// schemes. Read the on-device file directly instead.
            player.playLocal(url: localURL)
        } else {
            player.play(urlString: currentAudioUrl)
        }
        HapticFeedback.light()
    }

    @ViewBuilder
    private var playButtonLabel: some View {
        let size: CGFloat = context.isCompact ? 34 : 40
        VStack(spacing: 3) {
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [accent, accent.opacity(0.7)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: size, height: size)
                    .shadow(color: accent.opacity(0.3), radius: 6, y: 2)

                switch availability {
                case .ready:
                    if player.isLoading {
                        ProgressView()
                            .tint(.white)
                            .scaleEffect(0.6)
                    } else {
                        Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                            .font(.system(size: context.isCompact ? 13 : 15, weight: .bold))
                            .foregroundColor(.white)
                            .offset(x: player.isPlaying ? 0 : 1)
                    }
                case .needsDownload:
                    Image(systemName: "arrow.down.to.line")
                        .font(.system(size: context.isCompact ? 13 : 15, weight: .bold))
                        .foregroundColor(.white)
                case .downloading(let progress, _, _):
                    if progress > 0 {
                        Circle()
                            .trim(from: 0, to: progress)
                            .stroke(Color.white, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                            .rotationEffect(.degrees(-90))
                            .frame(width: size * 0.5, height: size * 0.5)
                            .animation(.linear(duration: 0.2), value: progress)
                    } else {
                        ProgressView()
                            .tint(.white)
                            .scaleEffect(0.6)
                    }
                }
            }

            // Label de taille — affiché uniquement dans les états transfert.
            // .ready ne montre rien (le bubble a déjà sa durée à droite du
            // scrubber). Parité visuelle avec DownloadBadgeView pour les
            // bubbles vidéo/image.
            switch availability {
            case .ready:
                EmptyView()
            case .needsDownload:
                let label = AudioPlayerView.formattedNeedsDownloadLabel(fileSize: attachment.fileSize)
                if !label.isEmpty {
                    Text(label)
                        .font(.system(size: 9, weight: .semibold, design: .monospaced))
                        .foregroundColor(isDark ? .white.opacity(0.65) : .black.opacity(0.55))
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                }
            case .downloading(_, let downloaded, let total):
                let label = AudioPlayerView.formattedDownloadingLabel(
                    downloadedBytes: downloaded,
                    totalBytes: total,
                    fallbackFileSize: attachment.fileSize
                )
                if !label.isEmpty {
                    Text(label)
                        .font(.system(size: 9, weight: .semibold, design: .monospaced))
                        .foregroundColor(isDark ? .white.opacity(0.65) : .black.opacity(0.55))
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                }
            }
        }
    }

    // MARK: - Waveform Progress

    /// Number of waveform bars. Higher density reads as a finer, more faithful
    /// envelope (thin capsules) rather than a row of chunky squares. Single
    /// source of truth: the render loop AND `loadWaveformSamples` must request
    /// the same count so cache keys and indices line up.
    private var waveformBarCount: Int { context.isCompact ? 48 : 72 }

    /// Persisted "at-rest" consumption fraction (0...1) for this attachment —
    /// drives the waveform tint BEFORE playback starts so a half- or
    /// fully-listened voice note reads at a glance. Pure store read; the player
    /// engine owns the live `progress`.
    private var restingProgress: Double {
        MediaConsumptionStore.shared.fraction(for: attachment.id) ?? 0
    }

    /// Maps a touch / drag x-position within the waveform strip to a normalized
    /// seek fraction (0...1), clamped at both edges. Single source of truth for
    /// BOTH the tap-to-seek and the swipe-to-scrub gestures on `waveformProgress`
    /// so the two paths can never compute the position differently. Guards a
    /// zero / negative width (pre-layout `GeometryReader` tick) so it never
    /// divides by zero. Pure; unit-tested.
    nonisolated public static func scrubFraction(locationX: CGFloat, width: CGFloat) -> Double {
        guard width > 0 else { return 0 }
        return Double(max(0, min(width, locationX)) / width)
    }

    private var waveformProgress: some View {
        GeometryReader { geo in
            let barCount = waveformBarCount
            // Thin bars with a tight gap. The bar width is derived from the
            // available width so the strip always fills edge-to-edge; the gap
            // is a fraction of the slot so dense layouts don't collapse.
            let slot = geo.size.width / CGFloat(barCount)
            let barWidth = max(1.5, slot * 0.62)

            // Live playback (incl. a resumed position) drives the bars with the
            // full accent. At rest we fall back to the persisted consumption
            // fraction with an attenuated accent — discreet, per the Prisme.
            let isLivePlayback = player.progress > 0
            let shownProgress = isLivePlayback ? player.progress : restingProgress
            let playedColor = isLivePlayback ? accent : accent.opacity(0.4)

            HStack(spacing: 0) {
                ForEach(0..<barCount, id: \.self) { i in
                    let fraction = (Double(i) + 0.5) / Double(barCount)
                    let isPlayed = fraction <= shownProgress
                    let h = waveformHeight(index: i, total: barCount)

                    Capsule(style: .continuous)
                        .fill(isPlayed ? playedColor : (isDark ? Color.white.opacity(0.20) : Color.black.opacity(0.12)))
                        .frame(width: barWidth, height: h)
                        .frame(width: slot, height: 24, alignment: .center)
                }
            }
            .frame(height: 24, alignment: .center)
        }
        .frame(height: 24)
        .overlay(
            GeometryReader { geo in
                Color.clear
                    .contentShape(Rectangle())
                    // Swipe-to-scrub. `DragGesture(minimumDistance: 0)` claims the
                    // touch the instant it lands on the strip, so dragging here
                    // scrubs the playback position INSTEAD of scrolling the
                    // enclosing conversation list / post detail or triggering the
                    // bubble's own tap/long-press. `.highPriorityGesture` makes the
                    // waveform win over those outer components — the user expects
                    // the waveform to own the swipe. A plain tap is the
                    // zero-distance case: it seeks to the tapped point on `.onEnded`.
                    .highPriorityGesture(
                        DragGesture(minimumDistance: 0)
                            .updating($isUserScrubbing) { _, state, _ in
                                state = true
                            }
                            .onChanged { value in
                                player.seek(to: Self.scrubFraction(
                                    locationX: value.location.x, width: geo.size.width))
                            }
                            .onEnded { value in
                                player.seek(to: Self.scrubFraction(
                                    locationX: value.location.x, width: geo.size.width))
                                HapticFeedback.light()
                            }
                    )
            }
            .allowsHitTesting(availability == .ready)
        )
        // Signale le scrub en cours à l'hôte (voir MediaScrubbingPreferenceKey) :
        // le conteneur de swipe de la bulle désengage reply/forward tant que le
        // doigt manipule la waveform.
        .preference(key: MediaScrubbingPreferenceKey.self, value: isUserScrubbing)
    }

    // MARK: - Time Row
    /// Timecodes seuls : `currentTime` à gauche, `estimatedDuration` à droite.
    /// La vitesse de lecture et l'affordance plein écran ont migré vers
    /// `rightChipsColumn` (capsules empilées à droite du widget).
    private var timeRow: some View {
        HStack(spacing: 0) {
            Text(formatMediaDuration(player.currentTime))
                .font(.system(size: context.isCompact ? 9 : 10, weight: .semibold, design: .monospaced))
                .foregroundColor(isDark ? .white.opacity(0.5) : .black.opacity(0.4))
            Spacer()
            Text(formatMediaDuration(estimatedDuration))
                .font(.system(size: context.isCompact ? 9 : 10, weight: .semibold, design: .monospaced))
                .foregroundColor(isDark ? .white.opacity(0.3) : .black.opacity(0.25))
        }
    }

    // MARK: - Right Chips Column (speed + progress, stacked vertically)
    /// Colonne droite du widget : chip vitesse en haut (alignée avec la
    /// waveform), chip pourcentage juste en dessous (alignée avec timeRow).
    /// Le tap sur la chip pourcentage ouvre la vue plein écran — l'ancienne
    /// icône `arrow.up.left.and.arrow.down.right` a été supprimée du timeRow,
    /// le pourcentage qui n'était qu'un libellé devient l'affordance.
    private var rightChipsColumn: some View {
        VStack(alignment: .trailing, spacing: context.isCompact ? 3 : 4) {
            speedChip
            percentageChip
        }
    }

    private var speedChip: some View {
        let isDefault = player.speed == .x1_0
        let chipBg: Color = isDefault
            ? (isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.05))
            : accent.opacity(0.85)
        let chipFg: Color = isDefault
            ? (isDark ? .white.opacity(0.55) : .black.opacity(0.45))
            : .white
        return Button {
            player.cycleSpeed()
            HapticFeedback.light()
        } label: {
            Text(player.speed.label)
                .font(.system(size: context.isCompact ? 9 : 10, weight: .bold, design: .monospaced))
                .foregroundColor(chipFg)
                .padding(.horizontal, context.isCompact ? 7 : 8)
                .padding(.vertical, context.isCompact ? 2 : 3)
                .background(Capsule().fill(chipBg))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: "media.audio.speed.cycle",
                                   defaultValue: "Vitesse de lecture \(player.speed.label)",
                                   bundle: .module))
    }

    private var percentageChip: some View {
        let pct = Int(player.progress * 100)
        let isStarted = pct > 0
        let chipBg: Color = isStarted
            ? accent.opacity(0.85)
            : (isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.05))
        let chipFg: Color = isStarted
            ? .white
            : (isDark ? .white.opacity(0.55) : .black.opacity(0.45))
        let label = Text("\(pct)%")
            .font(.system(size: context.isCompact ? 9 : 10, weight: .heavy, design: .monospaced))
            .foregroundColor(chipFg)
            .padding(.horizontal, context.isCompact ? 7 : 8)
            .padding(.vertical, context.isCompact ? 2 : 3)
            .background(Capsule().fill(chipBg))
            .contentTransition(.numericText())
            .animation(.easeInOut(duration: 0.15), value: pct)

        return Group {
            if let onFullscreen = onFullscreen {
                Button {
                    HapticFeedback.light()
                    onFullscreen()
                } label: { label }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "media.audio.open.fullscreen",
                                           defaultValue: "Ouvrir en plein écran, lecture \(pct)%",
                                           bundle: .module))
                .accessibilityHint(String(localized: "media.audio.open.fullscreen.hint",
                                          defaultValue: "Affiche la vue plein écran avec les options de sauvegarde",
                                          bundle: .module))
            } else {
                label
            }
        }
    }

    // MARK: - Context Actions
    @ViewBuilder
    private var contextActions: some View {
        if context == .composerAttachment {
            HStack(spacing: 4) {
                if let onEdit = onEdit {
                    Button { onEdit() } label: {
                        Image(systemName: "waveform.and.magnifyingglass")
                            .font(.system(size: 12))
                            .foregroundColor(isDark ? .white.opacity(0.45) : .black.opacity(0.35))
                            .frame(width: 26, height: 26)
                    }
                }
                if let onDelete = onDelete {
                    Button { onDelete() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 15))
                            .foregroundColor(MeeshyColors.error)
                    }
                }
            }
        }
    }

    // MARK: - Language Selector
    private var languageSelector: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                audioLanguagePill(flag: "\u{1F50A}", code: "orig", label: String(localized: "media.audio.original", defaultValue: "Original", bundle: .module),
                                  isSelected: selectedAudioLanguage == "orig")

                ForEach(translatedAudios, id: \.id) { audio in
                    let lang = DetectedLanguage.find(code: audio.targetLanguage)
                    audioLanguagePill(
                        flag: lang?.flag ?? "\u{1F310}",
                        code: audio.targetLanguage,
                        label: lang?.name ?? audio.targetLanguage,
                        isSelected: selectedAudioLanguage.lowercased() == audio.targetLanguage.lowercased()
                    )
                }
            }
            .padding(.horizontal, 8)
        }
    }

    private func audioLanguagePill(flag: String, code: String, label: String, isSelected: Bool) -> some View {
        Button {
            switchToLanguage(code)
            externalLanguage?.wrappedValue = code == "orig" ? nil : code
            HapticFeedback.light()
        } label: {
            HStack(spacing: 3) {
                Text(flag).font(.system(size: 12))
                Text(label).font(.system(size: 10, weight: isSelected ? .bold : .medium))
            }
            .foregroundColor(isSelected ? .white : (isDark ? .white.opacity(0.55) : .black.opacity(0.45)))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Capsule().fill(isSelected ? accent : (isDark ? Color.white.opacity(0.07) : Color.black.opacity(0.04))))
        }
    }

    // MARK: - Helpers
    private var playerBackground: some View {
        RoundedRectangle(cornerRadius: context.cornerRadius)
            .fill(isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03))
            .overlay(
                RoundedRectangle(cornerRadius: context.cornerRadius)
                    .stroke(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.05), lineWidth: 0.5)
            )
    }

    /// Bar height in points. Maps the normalized amplitude (0–1) to the strip
    /// height with a mild perceptual curve (`pow 0.65`) so quiet passages stay
    /// visible instead of collapsing to the floor next to a few loud peaks —
    /// the envelope reads truer to the ear. Falls back to a smooth procedural
    /// shape until the real samples finish decoding.
    private func waveformHeight(index: Int, total: Int) -> CGFloat {
        let minHeight: CGFloat = 2
        let maxHeight: CGFloat = 22
        let samples = waveformAnalyzer.samples
        if !samples.isEmpty {
            // Map the bar index onto the sample array so the render density and
            // the sample count can differ without dropping or duplicating data.
            let sampleIndex = min(samples.count - 1, index * samples.count / max(1, total))
            let normalized = Double(max(0, min(1, samples[sampleIndex])))
            let curved = pow(normalized, 0.65)
            return max(minHeight, CGFloat(curved) * maxHeight)
        }
        let seed = Double(index * 7 + 3)
        let base = 5.0 + sin(seed) * 6 + cos(seed * 0.5) * 4.0
        return CGFloat(max(minHeight, min(maxHeight, base)))
    }

    private func loadWaveformSamples() {
        guard waveformAnalyzer.samples.isEmpty else { return }
        // Decode at a higher resolution than we render so the perceived detail
        // stays crisp; `waveformHeight` down-maps bar index → sample index.
        let barCount = max(96, waveformBarCount)
        let resolved = MeeshyConfig.resolveMediaURL(attachment.fileUrl)?.absoluteString ?? attachment.fileUrl
        Task {
            if let data = try? await CacheCoordinator.shared.audio.data(for: resolved) {
                waveformAnalyzer.analyze(data: data, barCount: barCount)
            }
        }
    }
}
