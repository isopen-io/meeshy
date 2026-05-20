import SwiftUI
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
        VStack(spacing: 16) {
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
        VStack(spacing: 0) {
            header
                .padding(.horizontal, 16)
                .padding(.top, 10)

            Spacer(minLength: 6)

            waveformSection
                .padding(.horizontal, 18)

            transportControls
                .padding(.top, 18)

            Spacer(minLength: 6)

            bottomDock
                .padding(.horizontal, 16)
                .padding(.bottom, 28)
        }
    }

    private var bottomDock: some View {
        VStack(spacing: 10) {
            if let error = controller.lastError {
                errorBanner(error)
            }
            if let tool = controller.activeTool {
                toolPanel(for: tool)
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
        HStack(spacing: 10) {
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
                    .frame(width: 38, height: 38)
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(theme.textPrimary.opacity(enabled ? 0.85 : 0.25))
            }
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
    }

    // MARK: - Mode Switcher (Simple / Pro — timeline switch style)

    private var modeSwitcher: some View {
        HStack(spacing: 4) {
            modeSegment(.simple, label: String(localized: "audio.editor.mode.simple",
                                               defaultValue: "Simple", bundle: .module),
                        icon: "square.split.2x1")
            modeSegment(.pro, label: String(localized: "audio.editor.mode.pro",
                                            defaultValue: "Pro", bundle: .module),
                        icon: "slider.horizontal.below.rectangle")
        }
        .padding(4)
        .background(
            Capsule().fill(isDark ? MeeshyColors.indigo900.opacity(0.55)
                                  : MeeshyColors.indigo100.opacity(0.85))
        )
        .overlay(
            Capsule().strokeBorder(MeeshyColors.indigo400.opacity(0.25), lineWidth: 0.5)
        )
    }

    private func modeSegment(_ target: AudioEditorMode, label: String, icon: String) -> some View {
        let isActive = controller.mode == target
        return Button {
            guard !isActive else { return }
            HapticFeedback.light()
            controller.mode = target
        } label: {
            HStack(spacing: 5) {
                Image(systemName: icon).font(.system(size: 11, weight: .semibold))
                Text(label).font(.system(size: 12, weight: .semibold))
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
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
        VStack(spacing: 8) {
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
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                    .foregroundColor(accent)
                Spacer()
                Text(formatTime(controller.activeDuration))
                    .font(.system(size: 11, design: .monospaced))
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
                        .font(.system(size: 23, weight: .semibold))
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
        HStack(spacing: 10) {
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
            VStack(spacing: 5) {
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
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(isActive ? .white : accent)
                }
                Text(tool.title)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(isActive ? theme.textPrimary : theme.textMuted)
                    .lineLimit(1)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(tool.title)
        .accessibilityAddTraits(isActive ? [.isSelected] : [])
    }

    // MARK: - Tool Panels

    @ViewBuilder
    private func toolPanel(for tool: AudioEditorTool) -> some View {
        VStack(spacing: 12) {
            switch tool {
            case .trim:
                selectionHint(
                    text: String(localized: "audio.editor.trim.hint",
                                 defaultValue: "Glissez les poign\u{00E9}es pour garder une portion.",
                                 bundle: .module),
                    resetTitle: String(localized: "audio.editor.reset",
                                       defaultValue: "R\u{00E9}initialiser", bundle: .module),
                    reset: {
                        controller.trimStart = 0
                        controller.trimEnd = controller.activeDuration
                    }
                )
            case .split:
                selectionHint(
                    text: String(localized: "audio.editor.split.hint",
                                 defaultValue: "S\u{00E9}lectionnez la section \u{00E0} supprimer.",
                                 bundle: .module),
                    resetTitle: String(localized: "audio.editor.reset",
                                       defaultValue: "R\u{00E9}initialiser", bundle: .module),
                    reset: {
                        let d = controller.activeDuration
                        controller.splitStart = d * 0.4
                        controller.splitEnd = d * 0.6
                    }
                )
            case .fade:
                fadePanel
            case .speed:
                speedPanel
            case .volume:
                volumePanel
            case .transcribe:
                transcribePanel
            }
        }
        .padding(14)
        .background(panelBackground)
    }

    private var panelBackground: some View {
        RoundedRectangle(cornerRadius: 18, style: .continuous)
            .fill(isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.035))
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .strokeBorder(isDark ? Color.white.opacity(0.08)
                                  : Color.black.opacity(0.06), lineWidth: 1)
            )
    }

    private func selectionHint(text: String, resetTitle: String,
                               reset: @escaping () -> Void) -> some View {
        HStack(spacing: 10) {
            Text(text)
                .font(.system(size: 12))
                .foregroundColor(theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
            Button {
                HapticFeedback.light()
                reset()
            } label: {
                Text(resetTitle)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(accent)
            }
            .buttonStyle(.plain)
        }
    }

    private var fadePanel: some View {
        VStack(spacing: 10) {
            Toggle(isOn: $controller.fadeIn) {
                Label(String(localized: "audio.editor.fade.in",
                             defaultValue: "Fondu d'entr\u{00E9}e", bundle: .module),
                      systemImage: "arrow.up.right")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(theme.textPrimary)
            }
            .tint(accent)
            Toggle(isOn: $controller.fadeOut) {
                Label(String(localized: "audio.editor.fade.out",
                             defaultValue: "Fondu de sortie", bundle: .module),
                      systemImage: "arrow.down.right")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(theme.textPrimary)
            }
            .tint(accent)
        }
    }

    private var speedPanel: some View {
        let speeds: [Double] = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0]
        return HStack(spacing: 8) {
            ForEach(speeds, id: \.self) { value in
                let isActive = abs(controller.speed - value) < 0.001
                Button {
                    HapticFeedback.light()
                    controller.speed = value
                    applyPreviewRate()
                } label: {
                    Text(speedLabel(value))
                        .font(.system(size: 12, weight: .semibold, design: .monospaced))
                        .foregroundColor(isActive ? .white : theme.textSecondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                        .background(
                            RoundedRectangle(cornerRadius: 10)
                                .fill(isActive ? AnyShapeStyle(MeeshyColors.brandGradient)
                                      : AnyShapeStyle(isDark ? Color.white.opacity(0.06)
                                                      : Color.black.opacity(0.04)))
                        )
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var volumePanel: some View {
        VStack(spacing: 8) {
            HStack {
                Image(systemName: "speaker.fill")
                    .font(.system(size: 12))
                    .foregroundColor(theme.textMuted)
                Slider(value: $controller.gain, in: 0...2, step: 0.05)
                    .tint(accent)
                Image(systemName: "speaker.wave.3.fill")
                    .font(.system(size: 12))
                    .foregroundColor(theme.textMuted)
            }
            Text(volumeLabel(controller.gain))
                .font(.system(size: 12, weight: .semibold, design: .monospaced))
                .foregroundColor(accent)
        }
    }

    // MARK: - Transcribe Panel

    private var transcribePanel: some View {
        VStack(spacing: 12) {
            transcribeLanguageStrip
            transcribeAction
            transcribeResult
        }
    }

    private var transcribeLanguageStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(transcribableLanguages, id: \.code) { language in
                    let isActive = controller.transcriptionLanguage == language.code
                    Button {
                        HapticFeedback.light()
                        controller.transcriptionLanguage = language.code
                    } label: {
                        HStack(spacing: 5) {
                            Text(language.flag)
                            Text(language.nativeName)
                                .font(.system(size: 12, weight: .medium))
                                .lineLimit(1)
                        }
                        .foregroundColor(isActive ? .white : theme.textSecondary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(
                            Capsule().fill(isActive ? AnyShapeStyle(MeeshyColors.brandGradient)
                                           : AnyShapeStyle(isDark ? Color.white.opacity(0.06)
                                                           : Color.black.opacity(0.04)))
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 2)
        }
    }

    @ViewBuilder
    private var transcribeAction: some View {
        if controller.transcription == .running {
            HStack(spacing: 8) {
                ProgressView().tint(accent)
                Text(String(localized: "audio.editor.transcription.running",
                            defaultValue: "Transcription en cours\u{2026}", bundle: .module))
                    .font(.system(size: 12))
                    .foregroundColor(theme.textMuted)
            }
        } else {
            Button {
                HapticFeedback.medium()
                controller.transcribe()
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "waveform")
                    Text(transcribeButtonTitle)
                }
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(accent)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .strokeBorder(accent.opacity(0.35), lineWidth: 1)
                )
            }
            .buttonStyle(.plain)
        }
    }

    @ViewBuilder
    private var transcribeResult: some View {
        switch controller.transcription {
        case .done(let text, _):
            ScrollView {
                Text(text)
                    .font(.system(size: 13))
                    .foregroundColor(theme.textPrimary.opacity(0.85))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(maxHeight: 110)
        case .failed(let reason):
            transcribeMessage(icon: "exclamationmark.triangle.fill",
                              text: reason, tint: MeeshyColors.warning)
        case .permissionDenied:
            transcribeMessage(
                icon: "lock.fill",
                text: String(localized: "audio.editor.transcription.denied",
                             defaultValue: "Acc\u{00E8}s \u{00E0} la reconnaissance vocale refus\u{00E9}. Activez-le dans R\u{00E9}glages.",
                             bundle: .module),
                tint: MeeshyColors.error
            )
        case .idle, .running:
            EmptyView()
        }
    }

    private func transcribeMessage(icon: String, text: String, tint: Color) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 12))
                .foregroundColor(tint)
            Text(text)
                .font(.system(size: 12))
                .foregroundColor(theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
    }

    // MARK: - History Strip

    private var historyStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Array(controller.document.versions.enumerated()), id: \.element.id) { index, version in
                    historyChip(index: index, version: version)
                }
            }
            .padding(.horizontal, 2)
        }
    }

    private func historyChip(index: Int, version: AudioEditVersion) -> some View {
        let isActive = index == controller.document.cursor
        return Button {
            HapticFeedback.light()
            controller.selectVersion(version.id)
        } label: {
            HStack(spacing: 5) {
                Image(systemName: version.operation.displayIcon)
                    .font(.system(size: 10, weight: .semibold))
                Text(version.operation.displayLabel)
                    .font(.system(size: 11, weight: .medium))
                    .lineLimit(1)
            }
            .foregroundColor(isActive ? .white : theme.textSecondary)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
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
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .shadow(color: accent.opacity(0.3), radius: 12, y: 4)
        }
        .buttonStyle(.plain)
        .disabled(controller.isProcessing)
    }

    private func errorBanner(_ message: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 12))
                .foregroundColor(MeeshyColors.error)
            Text(message)
                .font(.system(size: 12))
                .foregroundColor(theme.textSecondary)
            Spacer(minLength: 0)
            Button {
                controller.lastError = nil
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(theme.textMuted)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(MeeshyColors.error.opacity(0.1))
        )
    }

    // MARK: - Processing Overlay

    private var processingOverlay: some View {
        ZStack {
            Color.black.opacity(0.35).ignoresSafeArea()
            VStack(spacing: 12) {
                ProgressView().tint(.white).scaleEffect(1.2)
                Text(String(localized: "audio.editor.processing",
                            defaultValue: "Traitement\u{2026}", bundle: .module))
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.white)
            }
            .padding(24)
            .background(
                RoundedRectangle(cornerRadius: 18)
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

    private var transcribableLanguages: [LanguageInfo] {
        let supported = controller.transcribableLanguageCodes
        let catalog = controller.languageCatalog.filter { supported.contains($0.code) }
        return catalog.isEmpty ? controller.languageCatalog : catalog
    }

    private var transcribeButtonTitle: String {
        switch controller.transcription {
        case .done, .failed, .permissionDenied:
            return String(localized: "audio.editor.transcription.retry",
                          defaultValue: "Transcrire \u{00E0} nouveau", bundle: .module)
        default:
            return String(localized: "audio.editor.transcription.start",
                          defaultValue: "Transcrire", bundle: .module)
        }
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
            guard !isScrubbing else { return }
            currentTime = time.seconds.isFinite ? time.seconds : 0
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
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .default)
        try? session.setActive(true)
    }

    private func deactivateAudioSession() {
        try? AVAudioSession.sharedInstance().setActive(
            false, options: [.notifyOthersOnDeactivation]
        )
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
        let total = Int(max(0, seconds))
        return String(format: "%d:%02d", total / 60, total % 60)
    }

    private func speedLabel(_ value: Double) -> String {
        value == 1.0 ? "1\u{00D7}" : String(format: "%g\u{00D7}", value)
    }

    private func volumeLabel(_ value: Double) -> String {
        value == 1.0
            ? String(localized: "audio.editor.volume.normal",
                     defaultValue: "Normal", bundle: .module)
            : String(format: "%.0f%%", value * 100)
    }
}

// MARK: - Audio Editor Waveform

/// Interactive waveform: scrub anywhere on the bars, and — when a selection is
/// supplied — drag the two edge handles. Pure presentation: it reports back via
/// callbacks and never touches the controller directly.
private struct AudioEditorWaveform: View {

    struct Selection: Equatable {
        var start: Double   // fraction 0…1
        var end: Double     // fraction 0…1
        var isRemoval: Bool // true → the region is cut out (split)
    }

    let samples: [Float]
    let progress: Double
    let accent: Color
    let isDark: Bool
    let selection: Selection?
    let onScrub: (Double) -> Void
    let onScrubEnded: () -> Void
    let onSelectionStart: (Double) -> Void
    let onSelectionEnd: (Double) -> Void

    private let barGap: CGFloat = 2
    private let spaceName = "audioEditorWaveform"

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                bars(in: geo.size)
                    .contentShape(Rectangle())
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { value in
                                onScrub(fraction(of: value.location.x, width: geo.size.width))
                            }
                            .onEnded { _ in onScrubEnded() }
                    )

                if let selection {
                    handle(at: selection.start, width: geo.size.width, height: geo.size.height,
                           isRemoval: selection.isRemoval) { x in
                        onSelectionStart(fraction(of: x, width: geo.size.width))
                    }
                    handle(at: selection.end, width: geo.size.width, height: geo.size.height,
                           isRemoval: selection.isRemoval) { x in
                        onSelectionEnd(fraction(of: x, width: geo.size.width))
                    }
                }

                playhead(in: geo.size)
            }
            .coordinateSpace(name: spaceName)
        }
    }

    // MARK: Bars

    private func bars(in size: CGSize) -> some View {
        let values = samples.isEmpty ? Array(repeating: Float(0.18), count: 80) : samples
        let count = values.count
        let totalGap = barGap * CGFloat(max(0, count - 1))
        let barWidth = max(1, (size.width - totalGap) / CGFloat(count))

        return HStack(alignment: .center, spacing: barGap) {
            ForEach(Array(values.enumerated()), id: \.offset) { item in
                let fraction = count > 1 ? Double(item.offset) / Double(count - 1) : 0
                let height = max(3, CGFloat(item.element) * size.height * 0.92)
                RoundedRectangle(cornerRadius: 1.5)
                    .fill(barColor(fraction: fraction))
                    .frame(width: barWidth, height: height)
            }
        }
        .frame(width: size.width, height: size.height, alignment: .center)
    }

    private func barColor(fraction: Double) -> Color {
        let neutral = isDark ? Color.white.opacity(0.14) : Color.black.opacity(0.12)
        guard let selection else {
            return fraction <= progress ? accent : neutral
        }
        let inside = fraction >= selection.start && fraction <= selection.end
        if selection.isRemoval {
            return inside ? MeeshyColors.error.opacity(0.45) : (fraction <= progress ? accent : neutral)
        }
        if !inside {
            return isDark ? Color.white.opacity(0.07) : Color.black.opacity(0.06)
        }
        return fraction <= progress ? accent : accent.opacity(0.32)
    }

    // MARK: Handle

    private func handle(at fraction: Double, width: CGFloat, height: CGFloat,
                        isRemoval: Bool, onMove: @escaping (CGFloat) -> Void) -> some View {
        let clamped = max(0, min(1, fraction))
        let x = clamped * width
        let tint = isRemoval ? MeeshyColors.error : accent
        return ZStack {
            Color.clear.frame(width: 44, height: max(44, height))
            RoundedRectangle(cornerRadius: 2)
                .fill(tint)
                .frame(width: 3, height: height)
            Circle()
                .fill(tint)
                .frame(width: 14, height: 14)
        }
        .contentShape(Rectangle())
        .position(x: x, y: height / 2)
        .gesture(
            DragGesture(minimumDistance: 0, coordinateSpace: .named(spaceName))
                .onChanged { value in onMove(value.location.x) }
        )
    }

    // MARK: Playhead

    private func playhead(in size: CGSize) -> some View {
        let x = max(0, min(1, progress)) * size.width
        return Rectangle()
            .fill(Color.white)
            .frame(width: 2, height: size.height)
            .shadow(color: .black.opacity(0.3), radius: 2)
            .offset(x: x - 1)
    }

    private func fraction(of x: CGFloat, width: CGFloat) -> Double {
        guard width > 0 else { return 0 }
        return Double(max(0, min(width, x)) / width)
    }
}
