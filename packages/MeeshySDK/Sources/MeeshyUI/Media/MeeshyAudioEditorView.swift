import SwiftUI
import UIKit
// `@preconcurrency` lets the periodic time-observer closure stay main-actor
// isolated (it touches @State) — consistent with AudioEditorController.
@preconcurrency import AVFoundation
import MeeshySDK

// MARK: - Meeshy Audio Editor View

/// The single, consolidated full-screen audio editor.
///
/// Replaces the former preview→editor two-step flow with one immersive,
/// theme-aware surface: an interactive waveform, a Simple/Pro mode toggle, a
/// FAB-style tool strip whose panels appear only when needed, a non-destructive
/// version history with undo/redo, and crash-safe transcription.
///
/// Callback: `onConfirm(finalURL, transcriptions, trimStart, trimEnd)`. Edits
/// are baked into `finalURL`, so `trimStart` is always `0` and `trimEnd` the
/// final duration — kept for source compatibility with existing call sites.
public struct MeeshyAudioEditorView: View {

    @StateObject private var controller: AudioEditorController
    @StateObject private var waveform = AudioWaveformAnalyzer()
    @ObservedObject private var theme = ThemeManager.shared

    private let accentColor: String
    private let onConfirm: (URL, [StoryVoiceTranscription], TimeInterval, TimeInterval) -> Void
    private let onCancel: () -> Void

    // Playback (view-owned: trim/speed preview needs region looping)
    @State private var player: AVPlayer?
    @State private var timeObserver: Any?
    @State private var endObserver: NSObjectProtocol?
    @State private var currentTime: Double = 0
    @State private var isPlaying = false
    @State private var loadedVersionID: UUID?
    @State private var isScrubbing = false

    public init(url: URL,
                accentColor: String = MeeshyColors.brandPrimaryHex,
                preferredLanguage: String = "fr",
                onConfirm: @escaping (URL, [StoryVoiceTranscription], TimeInterval, TimeInterval) -> Void,
                onCancel: @escaping () -> Void) {
        _controller = StateObject(wrappedValue: AudioEditorController(
            sourceURL: url, defaultLanguage: preferredLanguage
        ))
        self.accentColor = accentColor
        self.onConfirm = onConfirm
        self.onCancel = onCancel
    }

    /// VRAIS safe-area insets de la fenêtre. `.statusBarHidden()` (plus bas)
    /// remet `safeAreaInsets = 0` dans l'environnement SwiftUI ; le chrome
    /// (header, transport, dock) passerait sous la Dynamic Island / home
    /// indicator. La fenêtre expose toujours les insets physiques réels. Même
    /// pattern que `MeeshyVideoEditorView` / `MeeshyImageEditorView`.
    // MARK: - Body

    public var body: some View {
        ZStack {
            background

            if controller.isPreparing {
                preparingState
            } else {
                content
                    .transition(.opacity)
            }

            if controller.isProcessing {
                processingOverlay
            }
        }
        .animation(.easeInOut(duration: 0.25), value: controller.isPreparing)
        .animation(.spring(response: 0.34, dampingFraction: 0.86), value: controller.activeTool)
        .animation(.spring(response: 0.34, dampingFraction: 0.86), value: controller.mode)
        .animation(.easeInOut(duration: 0.2), value: controller.isProcessing)
        .task { await controller.prepare() }
        .adaptiveOnChange(of: controller.isPreparing) { _, preparing in
            if !preparing { loadActiveAudio() }
        }
        .adaptiveOnChange(of: controller.document.cursor) { _, _ in
            loadActiveAudio()
        }
        .adaptiveOnChange(of: currentTime) { _, time in handlePlaybackTick(time) }
        .onDisappear {
            teardownPlayer()
            deactivateAudioSession()
            // Cover retiré par l'état du parent (pas via Annuler/Confirmer) :
            // sans cette annulation, une reconnaissance EdgeTranscription ou
            // un export AudioEditEngine en vol tournait jusqu'au bout pour un
            // éditeur mort (speech recognizer retenu, travail gaspillé).
            controller.cancelBackgroundWork()
        }
        .statusBarHidden()
    }

    // MARK: - Background

    private var background: some View {
        ZStack {
            theme.backgroundPrimary.ignoresSafeArea()
            LinearGradient(
                colors: [accent.opacity(isDark ? 0.10 : 0.06), .clear,
                         secondary.opacity(isDark ? 0.08 : 0.05)],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
            .ignoresSafeArea()
        }
    }

    // MARK: - Preparing State

    private var preparingState: some View {
        VStack(spacing: MeeshySpacing.lg) {
            ProgressView()
                .tint(accent)
                .scaleEffect(1.2)
            Text(String(localized: "audio.editor.preparing",
                        defaultValue: "Pr\u{00E9}paration de l'audio\u{2026}", bundle: .module))
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
    }

    // MARK: - Content

    private var content: some View {
        // Aucun padding de safe area ici : seul le FOND porte
        // `.ignoresSafeArea()`, donc SwiftUI a déjà inséré ce contenu. Le
        // relire depuis la fenêtre clé et le repadder le comptait DEUX fois —
        // près de cent points de hauteur fantôme sur un iPhone à Dynamic
        // Island, sur une vue qui ne défilait pas.
        GeometryReader { geo in
            ScrollView {
                VStack(spacing: 0) {
                    header
                        .padding(.horizontal, MeeshySpacing.lg)
                        .padding(.top, MeeshySpacing.smPlus)

                    Spacer(minLength: 6)

                    waveformSection
                        .padding(.horizontal, MeeshySpacing.lg)

                    transportControls
                        .padding(.top, MeeshySpacing.lg)

                    Spacer(minLength: 6)

                    bottomDock
                        .padding(.horizontal, MeeshySpacing.lg)
                        .padding(.bottom, 28)
                }
                // Plancher égal au conteneur : tant que le contenu tient, les
                // `Spacer` se répartissent comme avant et le dock reste ancré
                // en bas. Au-delà — panneau d'outil ouvert par-dessus la bande
                // d'historique et la bande d'outils — la vue défile au lieu de
                // pousser les chips hors du cadre.
                .frame(minHeight: geo.size.height)
            }
        }
    }

    private var bottomDock: some View {
        VStack(spacing: MeeshySpacing.smPlus) {
            if let error = controller.lastError {
                errorBanner(error)
            }
            if let tool = controller.activeTool {
                AudioEditorToolPanel(tool: tool, controller: controller, accent: accent,
                                     isDark: isDark, onSpeedChange: applyPreviewRate)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
            if controller.document.hasHistory {
                historyStrip
            }
            toolStrip
            bottomBar
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: MeeshySpacing.smPlus) {
            circleButton(icon: "xmark") { cancelEditing() }
                .accessibilityLabel(String(localized: "audio.editor.close",
                                           defaultValue: "Fermer", bundle: .module))

            if controller.document.hasHistory {
                circleButton(icon: "arrow.uturn.backward",
                             enabled: controller.canUndo) { controller.undo() }
                    .accessibilityLabel(String(localized: "audio.editor.undo",
                                               defaultValue: "Annuler", bundle: .module))
                circleButton(icon: "arrow.uturn.forward",
                             enabled: controller.canRedo) { controller.redo() }
                    .accessibilityLabel(String(localized: "audio.editor.redo",
                                               defaultValue: "R\u{00E9}tablir", bundle: .module))
            }

            Spacer()

            modeSwitcher
        }
    }

    private func circleButton(icon: String, enabled: Bool = true, action: @escaping () -> Void) -> some View {
        Button {
            guard enabled else { return }
            HapticFeedback.light()
            action()
        } label: {
            ZStack {
                Circle()
                    .fill(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.05))
                    .frame(width: MeeshyControlSize.regular, height: MeeshyControlSize.regular)
                Image(systemName: icon)
                    .font(.system(size: MeeshyIconSize.sm, weight: .semibold))
                    .foregroundColor(theme.textPrimary.opacity(enabled ? 0.85 : 0.25))
            }
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
    }

    // MARK: - Mode Switcher (Simple / Pro — timeline switch style)

    private var modeSwitcher: some View {
        HStack(spacing: MeeshySpacing.xs) {
            modeSegment(.simple, label: String(localized: "audio.editor.mode.simple",
                                               defaultValue: "Simple", bundle: .module),
                        icon: "square.split.2x1")
            modeSegment(.pro, label: String(localized: "audio.editor.mode.pro",
                                            defaultValue: "Pro", bundle: .module),
                        icon: "slider.horizontal.below.rectangle")
        }
        .padding(MeeshySpacing.xs)
        .background(
            Capsule().fill(isDark ? MeeshyColors.indigo900.opacity(0.55)
                                  : MeeshyColors.indigo100.opacity(0.85))
        )
        .overlay(
            Capsule().strokeBorder(MeeshyColors.indigo400.opacity(0.25), lineWidth: MeeshyBorder.hairline)
        )
    }

    private func modeSegment(_ target: AudioEditorMode, label: String, icon: String) -> some View {
        let isActive = controller.mode == target
        return Button {
            guard !isActive else { return }
            HapticFeedback.light()
            controller.mode = target
        } label: {
            HStack(spacing: MeeshySpacing.xs) {
                Image(systemName: icon).font(.system(size: MeeshyIconSize.xxs, weight: .semibold))
                Text(label).font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
            }
            .padding(.horizontal, MeeshySpacing.md)
            .padding(.vertical, MeeshySpacing.xsPlus)
            .frame(minWidth: 72)
            .foregroundStyle(isActive ? Color.white
                             : (isDark ? MeeshyColors.indigo100 : MeeshyColors.indigo700))
            .background(
                Capsule().fill(isActive ? AnyShapeStyle(MeeshyColors.brandGradient)
                               : AnyShapeStyle(Color.clear))
            )
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isActive ? [.isSelected] : [])
    }

    // MARK: - Waveform Section

    private var waveformSection: some View {
        VStack(spacing: MeeshySpacing.sm) {
            AudioEditorWaveform(
                samples: waveform.samples,
                progress: playbackProgress,
                accent: accent,
                isDark: isDark,
                selection: waveformSelection,
                onScrub: { fraction in
                    isScrubbing = true
                    scrub(to: fraction)
                },
                onScrubEnded: { isScrubbing = false },
                onSelectionStart: { fraction in updateSelectionStart(fraction) },
                onSelectionEnd: { fraction in updateSelectionEnd(fraction) }
            )
            .frame(height: 96)

            HStack {
                Text(formatTime(displayTime))
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold, design: .monospaced))
                    .foregroundColor(accent)
                Spacer()
                Text(formatTime(controller.activeDuration))
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, design: .monospaced))
                    .foregroundColor(theme.textMuted)
            }
        }
    }

    private var waveformSelection: AudioEditorWaveform.Selection? {
        let duration = controller.activeDuration
        guard duration > 0 else { return nil }
        switch controller.activeTool {
        case .trim:
            return AudioEditorWaveform.Selection(
                start: controller.trimStart / duration,
                end: controller.trimEnd / duration,
                isRemoval: false
            )
        case .split:
            return AudioEditorWaveform.Selection(
                start: controller.splitStart / duration,
                end: controller.splitEnd / duration,
                isRemoval: true
            )
        default:
            return nil
        }
    }

    // MARK: - Transport

    private var transportControls: some View {
        HStack(spacing: 34) {
            transportButton(icon: "gobackward.5", size: 21) { skip(by: -5) }
            Button {
                togglePlayback()
            } label: {
                ZStack {
                    Circle()
                        .fill(MeeshyColors.brandGradient)
                        .frame(width: 60, height: 60)
                        .shadow(color: accent.opacity(0.4), radius: 12)
                    Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                        .font(.system(size: MeeshyIconSize.xxl, weight: .semibold))
                        .foregroundColor(.white)
                        .offset(x: isPlaying ? 0 : 2)
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(isPlaying
                ? String(localized: "audio.editor.pause", defaultValue: "Pause", bundle: .module)
                : String(localized: "audio.editor.play", defaultValue: "Lire", bundle: .module))
            transportButton(icon: "goforward.5", size: 21) { skip(by: 5) }
        }
    }

    private func transportButton(icon: String, size: CGFloat, action: @escaping () -> Void) -> some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            Image(systemName: icon)
                .font(.system(size: size, weight: .medium))
                .foregroundColor(theme.textPrimary.opacity(0.65))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Tool Strip (FAB-style)

    private var toolStrip: some View {
        HStack(spacing: MeeshySpacing.smPlus) {
            ForEach(controller.availableTools) { tool in
                toolFAB(tool)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func toolFAB(_ tool: AudioEditorTool) -> some View {
        let isActive = controller.activeTool == tool
        return Button {
            HapticFeedback.light()
            controller.selectTool(isActive ? nil : tool)
        } label: {
            VStack(spacing: MeeshySpacing.xs) {
                ZStack {
                    Circle()
                        .fill(isActive ? AnyShapeStyle(MeeshyColors.brandGradient)
                              : AnyShapeStyle(isDark ? Color.white.opacity(0.07)
                                              : Color.black.opacity(0.05)))
                        .frame(width: 50, height: 50)
                        .overlay(
                            Circle().strokeBorder(
                                isActive ? Color.clear : accent.opacity(0.22),
                                lineWidth: 1
                            )
                        )
                    Image(systemName: tool.icon)
                        .font(.system(size: MeeshyIconSize.lg, weight: .semibold))
                        .foregroundColor(isActive ? .white : accent)
                }
                Text(tool.title)
                    .font(.system(size: MeeshyFont.captionSize, weight: .medium))
                    .foregroundColor(isActive ? theme.textPrimary : theme.textMuted)
                    .lineLimit(1)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(tool.title)
        .accessibilityAddTraits(isActive ? [.isSelected] : [])
    }


    // MARK: - History Strip

    private var historyStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: MeeshySpacing.sm) {
                ForEach(Array(controller.document.versions.enumerated()), id: \.element.id) { index, version in
                    historyChip(index: index, version: version)
                }
            }
            .padding(.horizontal, MeeshySpacing.xxs)
        }
    }

    private func historyChip(index: Int, version: AudioEditVersion) -> some View {
        let isActive = index == controller.document.cursor
        return Button {
            HapticFeedback.light()
            controller.selectVersion(version.id)
        } label: {
            HStack(spacing: MeeshySpacing.xs) {
                Image(systemName: version.operation.displayIcon)
                    .font(.system(size: MeeshyIconSize.xxs, weight: .semibold))
                Text(version.operation.displayLabel)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .lineLimit(1)
            }
            .foregroundColor(isActive ? .white : theme.textSecondary)
            .padding(.horizontal, MeeshySpacing.smPlus)
            .padding(.vertical, MeeshySpacing.xsPlus)
            .background(
                Capsule().fill(isActive ? AnyShapeStyle(accent)
                               : AnyShapeStyle(isDark ? Color.white.opacity(0.06)
                                               : Color.black.opacity(0.04)))
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Bottom Bar

    private var bottomBar: some View {
        Button {
            if controller.canApply {
                HapticFeedback.medium()
                controller.apply()
            } else {
                confirmAndUse()
            }
        } label: {
            Text(controller.canApply
                 ? String(localized: "audio.editor.apply",
                          defaultValue: "Appliquer les modifications", bundle: .module)
                 : String(localized: "audio.editor.use",
                          defaultValue: "Utiliser l'audio", bundle: .module))
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 52)
                .background(MeeshyColors.brandGradient)
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous))
                .shadow(color: accent.opacity(0.3), radius: 12, y: 4)
        }
        .buttonStyle(.plain)
        .disabled(controller.isProcessing)
    }

    private func errorBanner(_ message: String) -> some View {
        HStack(spacing: MeeshySpacing.sm) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: MeeshyIconSize.xs))
                .foregroundColor(MeeshyColors.error)
            Text(message)
                .font(MeeshyFont.relative(MeeshyFont.smallSize))
                .foregroundColor(theme.textSecondary)
            Spacer(minLength: 0)
            Button {
                controller.lastError = nil
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: MeeshyIconSize.xxs, weight: .bold))
                    .foregroundColor(theme.textMuted)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, MeeshySpacing.md)
        .padding(.vertical, MeeshySpacing.sm)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                .fill(MeeshyColors.error.opacity(0.1))
        )
    }

    // MARK: - Processing Overlay

    private var processingOverlay: some View {
        ZStack {
            Color.black.opacity(0.35).ignoresSafeArea()
            VStack(spacing: MeeshySpacing.md) {
                ProgressView().tint(.white).scaleEffect(1.2)
                Text(String(localized: "audio.editor.processing",
                            defaultValue: "Traitement\u{2026}", bundle: .module))
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.white)
            }
            .padding(MeeshySpacing.xxl)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.lgPlus)
                    .fill(.ultraThinMaterial)
            )
        }
        .transition(.opacity)
    }

    // MARK: - Derived UI values

    private var isDark: Bool { theme.mode.isDark }
    private var accent: Color { Color(hex: accentColor) }
    private var secondary: Color {
        Color(hex: DynamicColorGenerator.hueShiftedHex(accentColor, degrees: 60))
    }

    private var displayTime: Double {
        min(currentTime, controller.activeDuration)
    }

    private var playbackProgress: Double {
        let duration = controller.activeDuration
        guard duration > 0 else { return 0 }
        return min(1, max(0, currentTime / duration))
    }


    // MARK: - Selection editing

    private func updateSelectionStart(_ fraction: Double) {
        let duration = controller.activeDuration
        guard duration > 0 else { return }
        let value = max(0, min(fraction, 1)) * duration
        switch controller.activeTool {
        case .trim:
            controller.trimStart = min(value, controller.trimEnd - 0.3)
        case .split:
            controller.splitStart = min(max(0, value), controller.splitEnd - 0.2)
        default:
            break
        }
    }

    private func updateSelectionEnd(_ fraction: Double) {
        let duration = controller.activeDuration
        guard duration > 0 else { return }
        let value = max(0, min(fraction, 1)) * duration
        switch controller.activeTool {
        case .trim:
            controller.trimEnd = max(value, controller.trimStart + 0.3)
        case .split:
            controller.splitEnd = min(max(value, controller.splitStart + 0.2), duration)
        default:
            break
        }
    }

    // MARK: - Playback

    private func loadActiveAudio() {
        let version = controller.document.active
        guard loadedVersionID != version.id else { return }
        loadedVersionID = version.id
        teardownPlayer()
        configureAudioSession()

        let url = controller.activeURL
        let item = AVPlayerItem(url: url)
        let newPlayer = AVPlayer(playerItem: item)
        player = newPlayer
        currentTime = 0
        isPlaying = false

        let interval = CMTime(seconds: 0.05, preferredTimescale: 600)
        timeObserver = newPlayer.addPeriodicTimeObserver(forInterval: interval, queue: .main) { time in
            MainActor.assumeIsolated {
                guard !isScrubbing else { return }
                currentTime = time.seconds.isFinite ? time.seconds : 0
            }
        }
        endObserver = NotificationCenter.default.addObserver(
            forName: AVPlayerItem.didPlayToEndTimeNotification,
            object: item, queue: .main
        ) { _ in
            Task { @MainActor in
                player?.seek(to: .zero)
                isPlaying = false
            }
        }

        waveform.analyze(url: url, barCount: 140)
    }

    private func teardownPlayer() {
        if let observer = timeObserver, let player {
            player.removeTimeObserver(observer)
        }
        timeObserver = nil
        if let endObserver {
            NotificationCenter.default.removeObserver(endObserver)
        }
        endObserver = nil
        player?.pause()
        player = nil
        isPlaying = false
    }

    private func togglePlayback() {
        guard let player else { return }
        HapticFeedback.light()
        if isPlaying {
            player.pause()
            isPlaying = false
        } else {
            let lower = trimLowerBound ?? 0
            let upper = trimUpperBound ?? controller.activeDuration
            if currentTime < lower || currentTime >= upper - 0.05 {
                seekPlayer(to: lower)
            }
            isPlaying = true
            // Setting a non-zero rate also starts playback.
            player.rate = previewRate
        }
    }

    private var previewRate: Float {
        controller.activeTool == .speed ? Float(controller.speed) : 1.0
    }

    private func handlePlaybackTick(_ time: Double) {
        guard isPlaying, let upper = trimUpperBound, let lower = trimLowerBound else { return }
        if time >= upper {
            seekPlayer(to: lower)
        }
    }

    private func skip(by seconds: Double) {
        let target = max(0, min(controller.activeDuration, currentTime + seconds))
        seekPlayer(to: target)
    }

    private func scrub(to fraction: Double) {
        let target = max(0, min(1, fraction)) * controller.activeDuration
        seekPlayer(to: target)
    }

    private func seekPlayer(to seconds: Double) {
        currentTime = seconds
        player?.seek(to: CMTime(seconds: seconds, preferredTimescale: 600),
                     toleranceBefore: .zero, toleranceAfter: .zero)
    }

    private func applyPreviewRate() {
        guard isPlaying, let player else { return }
        player.rate = previewRate
    }

    /// Lower playback bound — the trim region's start while trimming.
    private var trimLowerBound: Double? {
        controller.activeTool == .trim ? controller.trimStart : nil
    }

    private var trimUpperBound: Double? {
        controller.activeTool == .trim ? controller.trimEnd : nil
    }

    // MARK: - Audio Session

    private func configureAudioSession() {
        // Source UNIQUE call-aware : l'éditeur audio ne stomp pas un appel VoIP actif
        // (sinon micro coupé). No-op pendant un appel.
        MediaSessionCoordinator.shared.activateContentPlayback(.audible)
    }

    private func deactivateAudioSession() {
        // No-op pendant un appel (la session appartient à l'appel) — call-aware.
        MediaSessionCoordinator.shared.deactivatePlaybackSync()
    }

    // MARK: - Confirm / Cancel

    private func confirmAndUse() {
        teardownPlayer()
        deactivateAudioSession()
        let result = controller.finalize()
        let transcriptions = result.transcription.map { [$0] } ?? []
        HapticFeedback.success()
        onConfirm(result.url, transcriptions, 0, result.duration)
    }

    private func cancelEditing() {
        teardownPlayer()
        deactivateAudioSession()
        controller.discard()
        onCancel()
    }

    // MARK: - Formatting

    private func formatTime(_ seconds: Double) -> String {
        DurationFormat.clock(seconds)
    }

}
