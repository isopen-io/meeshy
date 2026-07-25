import SwiftUI
import Combine
import AVFoundation
import MeeshySDK

// MARK: - Story Voice Recorder

/// Recording component for stories.
/// Uses injected AudioRecordingProviding for actual recording logic.
/// Hold-to-record or tap-to-toggle. Large controls at the bottom.
public struct StoryVoiceRecorder<Recorder: AudioRecordingProviding>: View {
    /// Hands back the recorded file together with the language the user tagged
    /// it with, so the downstream audio editor (transcription) opens pre-set.
    public var onRecordComplete: (URL, String) -> Void

    // `@StateObject` (et non `@ObservedObject`) : le call site (sheet +Media)
    // crée le recorder inline via l'init de convenance — en observed, chaque
    // ré-évaluation du panel remplaçait l'instance observée mid-recording et
    // orphelinait un AVAudioRecorder live (micro chaud, enregistrement perdu).
    @StateObject private var recorder: Recorder
    @State private var wavePhase: CGFloat = 0
    @State private var phaseTimer: Timer?
    @State private var errorMessage: String?
    @State private var hasCompleted = false
    @State private var selectedLanguage: String

    /// `nil` = no cap (the previous hardcoded 1-minute limit is removed). A
    /// caller may still opt into a ceiling.
    private let maxDuration: TimeInterval?

    @Environment(\.colorScheme) private var colorScheme

    public init(recorder: @autoclosure @escaping () -> Recorder,
                preferredLanguage: String = "fr",
                maxDuration: TimeInterval? = nil,
                onRecordComplete: @escaping (URL, String) -> Void) {
        self._recorder = StateObject(wrappedValue: recorder())
        self._selectedLanguage = State(initialValue: preferredLanguage)
        self.maxDuration = maxDuration
        self.onRecordComplete = onRecordComplete
    }

    // MARK: - Theme-aware colors
    //
    // Le panneau repose sur `.ultraThinMaterial` : en light mode ce matériau est
    // quasi blanc, donc le `.white` codé en dur disparaissait (texte/contrôles
    // blanc-sur-blanc, bug #5). On dérive donc les teintes du colorScheme.

    private var primaryTextColor: Color {
        colorScheme == .dark ? .white : MeeshyColors.indigo950
    }
    private var secondaryTextColor: Color {
        colorScheme == .dark ? .white.opacity(0.55) : MeeshyColors.indigo600.opacity(0.75)
    }
    private var controlFill: Color {
        colorScheme == .dark ? Color.white.opacity(0.12) : MeeshyColors.indigo500.opacity(0.12)
    }
    private var controlIcon: Color {
        colorScheme == .dark ? .white.opacity(0.7) : MeeshyColors.indigo700
    }

    public var body: some View {
        VStack(spacing: 0) {
            // Panel header
            HStack {
                Image(systemName: "mic.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(MeeshyColors.brandGradient)
                Text(String(localized: "story.voiceRecorder.title", defaultValue: "Enregistrement", bundle: .module))
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundColor(primaryTextColor)
                Spacer()
            }
            .padding(.bottom, 12)

            VStack(spacing: 20) {
                if let error = errorMessage {
                    Text(error)
                        .font(.system(size: 13))
                        .foregroundColor(MeeshyColors.error)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 20)
                }

                Spacer()

                waveformView
                    .frame(height: 56)
                    .padding(.horizontal, 20)
                    .opacity(recorder.isRecording ? 1 : 0.3)

                Text(recorder.isRecording
                     ? recordingTimeLabel
                     : String(localized: "story.voiceRecorder.holdToRecord", defaultValue: "Appuyez pour enregistrer", bundle: .module))
                    .font(.system(size: 13, weight: .medium, design: .monospaced))
                    .foregroundColor(recorder.isRecording ? MeeshyColors.brandPrimary : secondaryTextColor)

                languageStrip

                Spacer()

                // Controls always at the bottom
                HStack(spacing: 32) {
                    if recorder.isRecording {
                        // Cancel
                        Button {
                            recorder.cancelRecording()
                            stopPhaseTimer()
                            HapticFeedback.light()
                        } label: {
                            ZStack {
                                Circle()
                                    .fill(controlFill)
                                    .frame(width: 50, height: 50)
                                Image(systemName: "xmark")
                                    .font(.system(size: 18, weight: .medium))
                                    .foregroundColor(controlIcon)
                            }
                        }
                    }

                    recordButton

                    if recorder.isRecording {
                        // Spacer for symmetry
                        Circle()
                            .fill(Color.clear)
                            .frame(width: 50, height: 50)
                    }
                }
                .padding(.bottom, 4)
            }
            .padding(.vertical, 8)
        }
        .padding(16)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal, 16)
        .onDisappear {
            stopPhaseTimer()
            // Panel fermé mid-recording (swipe, changement d'onglet) : sans ce
            // cancel le micro et la session audio restaient actifs.
            if recorder.isRecording {
                recorder.cancelRecording()
            }
        }
        .onChange(of: recorder.isRecording) { isRecording in
            if !isRecording {
                stopRecording()
            }
        }
    }

    // MARK: - Recording time label

    private var recordingTimeLabel: String {
        let elapsed = formatTime(recorder.duration)
        guard let maxDuration else { return elapsed }
        return "\(elapsed) / \(formatTime(maxDuration))"
    }

    private func formatTime(_ seconds: TimeInterval) -> String {
        let total = Int(seconds.rounded(.down))
        return String(format: "%d:%02d", total / 60, total % 60)
    }

    // MARK: - Language strip

    /// Lets the user tag the recorded audio's spoken language so the editor
    /// (and downstream transcription / Prisme) start from the right idiom.
    private var languageStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(LanguageData.allLanguagesCommonFirst, id: \.code) { language in
                    let isActive = selectedLanguage == language.code
                    Button {
                        HapticFeedback.light()
                        selectedLanguage = language.code
                    } label: {
                        HStack(spacing: 5) {
                            Text(language.flag)
                            Text(language.nativeName)
                                .font(.system(size: 12, weight: .medium))
                                .lineLimit(1)
                        }
                        .foregroundColor(isActive ? .white : secondaryTextColor)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(
                            Capsule().fill(isActive
                                           ? AnyShapeStyle(MeeshyColors.brandGradient)
                                           : AnyShapeStyle(controlFill))
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 4)
        }
        .frame(height: 34)
    }

    // MARK: - Waveform

    private var waveformView: some View {
        HStack(spacing: 3) {
            ForEach(0..<15, id: \.self) { i in
                let level: CGFloat = i < recorder.audioLevels.count ? recorder.audioLevels[i] : 0
                RoundedRectangle(cornerRadius: 2.5)
                    .fill(MeeshyColors.brandPrimary.opacity(recorder.isRecording ? 0.9 : 0.4))
                    .frame(width: 5, height: recorder.isRecording ? max(6, 6 + 40 * level) : 6)
                    .animation(.spring(response: 0.08, dampingFraction: 0.6), value: level)
            }
        }
    }

    // MARK: - Record Button

    private var recordButton: some View {
        ZStack {
            Circle()
                .fill(recorder.isRecording ? AnyShapeStyle(MeeshyColors.brandPrimary) : AnyShapeStyle(controlFill))
                .frame(width: 72, height: 72)
                .scaleEffect(recorder.isRecording ? 1.1 : 1.0)
                .animation(.spring(response: 0.3, dampingFraction: 0.6), value: recorder.isRecording)

            Image(systemName: recorder.isRecording ? "stop.fill" : "mic.fill")
                .font(.system(size: 26, weight: .semibold))
                .foregroundColor(recorder.isRecording ? .white : controlIcon)
        }
        .shadow(color: recorder.isRecording ? MeeshyColors.brandPrimary.opacity(0.5) : .clear, radius: 16)
        .onTapGesture {
            if recorder.isRecording {
                stopRecording()
            } else {
                startRecording()
            }
        }
        .accessibilityLabel(recorder.isRecording
            ? String(localized: "story.voiceRecorder.stop", defaultValue: "Arr\u{00EA}ter l'enregistrement", bundle: .module)
            : String(localized: "story.voiceRecorder.start", defaultValue: "Enregistrer", bundle: .module))
    }

    // MARK: - Recording Logic

    private func startRecording() {
        guard !recorder.isRecording else { return }
        hasCompleted = false

        // La demande passe par `DevicePermissions` (SDK core), dont le callback
        // est confiné dans un helper `nonisolated` : le système rappelle sur la
        // queue TCC, et sous `defaultIsolation(MainActor)` (MeeshyUI) un closure
        // littéral y hériterait de `@MainActor` — son prologue
        // (`swift_task_isCurrentExecutorImpl`) vérifie l'exécuteur À L'ENTRÉE et
        // trappe (`EXC_BREAKPOINT`) AVANT même qu'un `Task { @MainActor in }`
        // interne ne s'exécute (crash 1re demande de permission micro story,
        // 2026-06-15). Le résultat est consommé ici sur le MainActor via `await`.
        Task { @MainActor in
            let state = await DevicePermissions.requestMicrophone()
            guard state.isUsable else {
                errorMessage = state.needsSettingsRedirect
                    ? String(localized: "audio.recorder.micDeniedSettings", defaultValue: "Micro refus\u{00E9} \u{2014} autorisez-le dans R\u{00E9}glages", bundle: .module)
                    : String(localized: "audio.recorder.micDenied", defaultValue: "Permission micro refus\u{00E9}e", bundle: .module)
                return
            }
            errorMessage = nil
            recorder.configure(with: .story)
            recorder.startRecording()
            HapticFeedback.medium()

            phaseTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { _ in
                Task { @MainActor in
                    if let maxDuration, recorder.duration >= maxDuration {
                        stopRecording()
                    }
                }
            }
        }
    }

    private func stopRecording() {
        guard !hasCompleted else { return }
        hasCompleted = true

        let url: URL?
        if recorder.isRecording {
            url = recorder.stopRecording()
        } else {
            url = recorder.recordedFileURL
        }

        stopPhaseTimer()
        HapticFeedback.success()

        if let url, recorder.duration > 0.5 {
            onRecordComplete(url, selectedLanguage)
        }
    }

    private func stopPhaseTimer() {
        phaseTimer?.invalidate()
        phaseTimer = nil
    }
}

// MARK: - Backward-compatible convenience init (uses DefaultSDKAudioRecorder)

extension StoryVoiceRecorder where Recorder == DefaultSDKAudioRecorder {
    public init(preferredLanguage: String = "fr",
                maxDuration: TimeInterval? = nil,
                onRecordComplete: @escaping (URL, String) -> Void) {
        self.init(recorder: DefaultSDKAudioRecorder(),
                  preferredLanguage: preferredLanguage,
                  maxDuration: maxDuration,
                  onRecordComplete: onRecordComplete)
    }
}
