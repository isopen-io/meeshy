import SwiftUI
import AVFoundation
import Combine
import os
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
    public var attachmentId: String?

    private var player: AVAudioPlayer?
    private var timer: Timer?
    private var loadTask: Task<Void, Never>?
    public private(set) var currentUrl: String?
    private var listenStartTime: Date?

    public override init() {
        super.init()
        PlaybackCoordinator.shared.register(self)
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
    }

    // MARK: - Play from remote URL (through cache)
    public func play(urlString: String) {
        PlaybackCoordinator.shared.willStartPlaying(audio: self)
        resetState()
        guard !urlString.isEmpty else { return }
        currentUrl = urlString
        isLoading = true

        let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString

        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [])
            try AVAudioSession.sharedInstance().setActive(true)
        } catch { }

        loadTask = Task {
            do {
                let data = try await CacheCoordinator.shared.audio.data(for: resolved)
                guard !Task.isCancelled else { return }
                playData(data)
            } catch {
                Self.log.error("play(urlString) cache fetch echec (\(resolved, privacy: .public)): \(error.localizedDescription, privacy: .public)")
                isLoading = false
            }
        }
    }

    // MARK: - Play from local file
    public func playLocal(url: URL) {
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
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [])
            try AVAudioSession.sharedInstance().setActive(true)
            let data = try Data(contentsOf: url)
            playData(data)
        } catch {
            Self.log.error("playLocal echec (\(url.lastPathComponent, privacy: .public)): \(error.localizedDescription, privacy: .public)")
            isLoading = false
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
        loadTask?.cancel()
        loadTask = nil
    }

    public func stop() {
        resetState()
        currentUrl = nil
    }

    public func togglePlayPause() {
        guard let player = player else { return }
        if player.isPlaying {
            player.pause()
            isPlaying = false
            timer?.invalidate()
            reportListenProgress(complete: false)
        } else {
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

    // MARK: - Timer
    private func startProgressTimer() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self = self, let player = self.player else { return }
                if player.isPlaying {
                    self.currentTime = player.currentTime
                    self.progress = player.duration > 0 ? player.currentTime / player.duration : 0
                }
            }
        }
    }

    deinit {
        MainActor.assumeIsolated {
            timer?.invalidate()
            loadTask?.cancel()
        }
    }

    @MainActor public func unregisterFromCoordinator() {
        PlaybackCoordinator.shared.unregister(self)
    }

    // MARK: - Autoplay Registry (static)
    private static var autoplayRegistry: [(url: String, play: () -> Void)] = []

    public static func registerAutoplay(url: String, play: @escaping () -> Void) {
        autoplayRegistry.removeAll { $0.url == url }
        autoplayRegistry.append((url: url, play: play))
    }

    public static func unregisterAutoplay(url: String) {
        autoplayRegistry.removeAll { $0.url == url }
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

    /// ByteCountFormatter binaire avec arrondi entier. Reproduit le même
    /// format que `AttachmentDownloader.fmt` côté app pour cohérence
    /// visuelle entre les badges DownloadBadgeView et les labels audio.
    nonisolated public static func formatBytes(_ bytes: Int64) -> String {
        let formatter = ByteCountFormatter()
        formatter.countStyle = .binary
        formatter.allowedUnits = [.useKB, .useMB, .useGB]
        formatter.includesUnit = true
        formatter.includesCount = true
        formatter.zeroPadsFractionDigits = false
        return formatter.string(fromByteCount: bytes)
    }
}

public struct AudioPlayerView: View {
    public let attachment: MeeshyMessageAttachment
    public let context: MediaPlayerContext

    public var accentColor: String = "08D9D6"
    public var transcription: MessageTranscription? = nil
    public var translatedAudios: [MessageTranslatedAudio] = []

    public var onFullscreen: (() -> Void)? = nil
    public var onRequestTranscription: (() -> Void)? = nil
    public var onRetranscribe: (() -> Void)? = nil
    public var onDelete: (() -> Void)? = nil
    public var onEdit: (() -> Void)? = nil
    public var onPlayingChange: ((Bool) -> Void)? = nil
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

    @ObservedObject private var theme = ThemeManager.shared
    @State private var isTranscriptionExpanded = false
    @State private var selectedAudioLanguage: String = "orig"
    @State private var isRetranscribing = false
    /// `true` between the moment the user taps "Transcrire" / "Re-transcrire"
    /// and the moment the server-pushed transcription lands in `transcription`.
    /// Drives the shimmer skeleton in `transcriptionBlock`.
    @State private var isTranscribing = false
    /// Toggled in `onAppear` of the skeleton view to drive the pulse.
    @State private var transcriptionPulsePhase = false

    private var isDark: Bool { theme.mode.isDark || context.isImmersive }
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
        accentColor: String = "08D9D6", transcription: MessageTranscription? = nil,
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
        @ViewBuilder topContent: () -> TopContent = { EmptyView() },
        @ViewBuilder bottomContent: () -> BottomContent = { EmptyView() }
    ) {
        self.attachment = attachment; self.context = context; self.accentColor = accentColor
        self.transcription = transcription; self.translatedAudios = translatedAudios
        self.onFullscreen = onFullscreen; self.onRequestTranscription = onRequestTranscription
        self.onRetranscribe = onRetranscribe
        self.onDelete = onDelete; self.onEdit = onEdit
        self.onPlayingChange = onPlayingChange
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
            player.attachmentId = attachment.id
            let autoplayUrl = attachment.fileUrl
            AudioPlaybackManager.registerAutoplay(url: autoplayUrl) { [player] in
                // Optimistic local audio can never load through the cache
                // (DiskCacheStore.data(for:) rejects file://) — autoplay it
                // straight from disk. See Sprint 3 RC3.2.
                if autoplayUrl.hasPrefix("file://"), let localURL = URL(string: autoplayUrl) {
                    player.playLocal(url: localURL)
                } else {
                    player.play(urlString: autoplayUrl)
                }
            }
            loadWaveformSamples()
        }
        .onDisappear {
            AudioPlaybackManager.unregisterAutoplay(url: attachment.fileUrl)
            player.unregisterFromCoordinator()
        }
        .onChange(of: player.isPlaying) { playing in
            onPlayingChange?(playing)
            if playing { loadWaveformSamples() }
        }
        .onChange(of: externalLanguage?.wrappedValue) { newLang in
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
            let isActive = player.isPlaying
                && player.currentTime >= single.startTime
                && player.currentTime < single.endTime
            let isPast = !isActive && player.currentTime >= single.endTime
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
            let activeIdx = segments.firstIndex { player.currentTime >= $0.startTime && player.currentTime < $0.endTime }
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
    }

    private var isDownloading: Bool {
        if case .downloading = availability { return true }
        return false
    }

    private func handlePlayTap() {
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
    private var waveformProgress: some View {
        GeometryReader { geo in
            let barCount = context.isCompact ? 25 : 35
            let spacing: CGFloat = 2
            let totalSpacing = spacing * CGFloat(barCount - 1)
            let barWidth = max(2, (geo.size.width - totalSpacing) / CGFloat(barCount))

            HStack(spacing: spacing) {
                ForEach(0..<barCount, id: \.self) { i in
                    let fraction = Double(i) / Double(barCount)
                    let isPlayed = fraction <= player.progress
                    let h = waveformHeight(index: i, total: barCount)

                    RoundedRectangle(cornerRadius: 1)
                        .fill(isPlayed ? accent : (isDark ? Color.white.opacity(0.18) : Color.black.opacity(0.1)))
                        .frame(width: barWidth, height: h)
                }
            }
            .frame(height: 22, alignment: .center)
        }
        .frame(height: 22)
        .overlay(
            GeometryReader { geo in
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture { location in
                        let fraction = max(0, min(1, location.x / geo.size.width))
                        player.seek(to: fraction)
                        HapticFeedback.light()
                    }
            }
            .allowsHitTesting(availability == .ready)
        )
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
                            .foregroundColor(Color(hex: "FF6B6B"))
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

    private func waveformHeight(index: Int, total: Int) -> CGFloat {
        let samples = waveformAnalyzer.samples
        if !samples.isEmpty && index < samples.count {
            let sample = CGFloat(samples[index])
            return max(3, sample * 18)
        }
        let seed = Double(index * 7 + 3)
        let base = 4.0 + sin(seed) * 5 + cos(seed * 0.5) * 3.5
        return CGFloat(max(3, min(18, base)))
    }

    private func loadWaveformSamples() {
        guard waveformAnalyzer.samples.isEmpty else { return }
        let barCount = context.isCompact ? 25 : 35
        let resolved = MeeshyConfig.resolveMediaURL(attachment.fileUrl)?.absoluteString ?? attachment.fileUrl
        Task {
            if let data = try? await CacheCoordinator.shared.audio.data(for: resolved) {
                waveformAnalyzer.analyze(data: data, barCount: barCount)
            }
        }
    }
}
