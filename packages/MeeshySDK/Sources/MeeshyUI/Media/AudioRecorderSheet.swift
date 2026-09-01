import SwiftUI
import Combine
import AVFoundation
import MeeshySDK

// MARK: - Unified Audio Recorder Sheet

/// LA feuille d'enregistrement audio, partagée par toutes les surfaces qui
/// capturent de la voix pour une composition : stories, posts et réels
/// (2026-08-13 — unification de `StoryVoiceRecorder` et de l'UI dupliquée
/// d'`AudioPostComposerView`).
///
/// Uses injected AudioRecordingProviding for actual recording logic.
/// Tap-to-toggle record. Large controls at the bottom.
///
/// Composant SDK au sens du « test du grain » : paramètres opaques (recorder
/// injecté, closures de portes), aucune décision produit — les call sites
/// décident quoi faire du fichier (éditeur story, transcription post, etc.).
public struct AudioRecorderSheet<Recorder: AudioRecordingProviding>: View {
    /// Hands back the recorded file together with the language the user tagged
    /// it with, so the downstream consumer (audio editor, transcription) opens
    /// pre-set.
    public var onRecordComplete: (URL, String) -> Void
    /// Portes vers les autres sources d'audio (import Fichiers, bibliothèque de
    /// sons), rendues en chips sous le header. `nil` = pas de chip — le
    /// recorder reste un pur enregistreur pour les call sites qui n'offrent
    /// pas ces flux. Closures opaques : le composant ignore ce qu'elles ouvrent.
    var onImportAudioFile: (() -> Void)?
    var onOpenSoundLibrary: (() -> Void)?
    /// **Ce que l'hôte veut poser SOUS le bouton d'enregistrement.** Fente
    /// opaque : la feuille ignore ce qu'elle rend. Le composer y met le rôle de
    /// mixage (fond / premier plan) et le rognage — des décisions PRODUIT, qui
    /// n'ont pas leur place dans un enregistreur générique partagé par les
    /// stories, les posts et les réels.
    ///
    /// Masquée PENDANT l'enregistrement, comme les chips de source : les
    /// réglages de ce qu'on n'a pas encore capturé n'ont rien à dire là.
    var accessory: AnyView?
    /// La strip de langue tague la langue PARLÉE de l'enregistrement. Un call
    /// site qui possède déjà son propre sélecteur (ex. locale de transcription
    /// on-device du composer de post audio) la masque — la langue rendue est
    /// alors `preferredLanguage` telle quelle.
    var showsLanguageStrip: Bool

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

    @Environment(\.colorScheme) private var colorScheme

    public init(recorder: @autoclosure @escaping () -> Recorder,
                preferredLanguage: String = "fr",
                showsLanguageStrip: Bool = true,
                onImportAudioFile: (() -> Void)? = nil,
                onOpenSoundLibrary: (() -> Void)? = nil,
                accessory: AnyView? = nil,
                onRecordComplete: @escaping (URL, String) -> Void) {
        self._recorder = StateObject(wrappedValue: recorder())
        self._selectedLanguage = State(initialValue: preferredLanguage)
        self.showsLanguageStrip = showsLanguageStrip
        self.onImportAudioFile = onImportAudioFile
        self.onOpenSoundLibrary = onOpenSoundLibrary
        self.accessory = accessory
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

            if !recorder.isRecording {
                AudioRecorderSourceChips(
                    onImportAudioFile: onImportAudioFile,
                    onOpenSoundLibrary: onOpenSoundLibrary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.bottom, 8)
            }

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

                if showsLanguageStrip {
                    languageStrip
                }

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

                if let accessory, !recorder.isRecording {
                    accessory
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
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
        .adaptiveOnChange(of: recorder.isRecording) { _, isRecording in
            if !isRecording {
                stopRecording()
            }
        }
    }

    // MARK: - Recording time label

    /// Temps écoulé, sans « / plafond » : l'enregistrement n'a plus de limite
    /// de durée (directive produit 2026-07-26).
    private var recordingTimeLabel: String {
        formatTime(recorder.duration)
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

// MARK: - Source chips (Fichiers / Bibliothèque)

/// Rangée d'accès aux sources d'audio alternatives. Chaque chip n'existe que si
/// SA closure est fournie ; sans aucune closure la rangée n'a aucune surface
/// (absence structurelle) — les call sites qui ne passent rien rendent le
/// recorder à l'identique.
///
/// **PUBLIQUE depuis #4657**, parce qu'un hôte peut vouloir la poser HORS du
/// cadre « Enregistrement ». Enregistrer, importer un fichier et emprunter à la
/// bibliothèque sont trois SOURCES au même rang : les deux dernières rangées
/// sous le titre de la première se lisaient comme deux options de la capture,
/// ce qu'elles ne sont pas (directive porteur du 2026-09-01).
public struct AudioRecorderSourceChips: View {
    public var onImportAudioFile: (() -> Void)?
    public var onOpenSoundLibrary: (() -> Void)?

    public init(onImportAudioFile: (() -> Void)? = nil,
                onOpenSoundLibrary: (() -> Void)? = nil) {
        self.onImportAudioFile = onImportAudioFile
        self.onOpenSoundLibrary = onOpenSoundLibrary
    }

    public var body: some View {
        if onImportAudioFile != nil || onOpenSoundLibrary != nil {
            HStack(spacing: 8) {
                if let onImportAudioFile {
                    chip(icon: "folder.fill",
                         text: String(localized: "story.voiceRecorder.fromFiles", defaultValue: "Fichiers", bundle: .module),
                         action: onImportAudioFile)
                }
                if let onOpenSoundLibrary {
                    chip(icon: "music.note.list",
                         text: String(localized: "story.voiceRecorder.fromLibrary", defaultValue: "Bibliothèque", bundle: .module),
                         action: onOpenSoundLibrary)
                }
            }
        }
    }

    private func chip(icon: String, text: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            MediaPillLabel(icon: icon, text: text)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Convenience init (uses DefaultSDKAudioRecorder)

extension AudioRecorderSheet where Recorder == DefaultSDKAudioRecorder {
    public init(preferredLanguage: String = "fr",
                showsLanguageStrip: Bool = true,
                onImportAudioFile: (() -> Void)? = nil,
                onOpenSoundLibrary: (() -> Void)? = nil,
                accessory: AnyView? = nil,
                onRecordComplete: @escaping (URL, String) -> Void) {
        // **Un init de convenance qui laisse tomber un paramètre le rend
        // inatteignable.** Le seul appelant de cette feuille passe par ici : un
        // `accessory` absent de CETTE signature n'existe pas, quoi qu'en dise
        // l'init principal. Défaut déjà commis sur `StoryTextEditToolbar`.
        self.init(recorder: DefaultSDKAudioRecorder(),
                  preferredLanguage: preferredLanguage,
                  showsLanguageStrip: showsLanguageStrip,
                  onImportAudioFile: onImportAudioFile,
                  onOpenSoundLibrary: onOpenSoundLibrary,
                  accessory: accessory,
                  onRecordComplete: onRecordComplete)
    }
}
