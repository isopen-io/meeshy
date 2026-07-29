import SwiftUI
import Combine
import AVFoundation
import MeeshySDK

public struct VoiceRecordingView<Recorder: AudioRecordingProviding>: View {
    let accentColor: String
    let minimumSamples: Int
    let minimumDurationSeconds: Int
    let onSamplesReady: (([Data]) -> Void)?
    /// Langue dans laquelle l'utilisateur va PARLER — pas celle de l'interface.
    /// Un arabophone dont l'app est en français doit pouvoir lire en arabe.
    let initialLanguage: String?

    // `@StateObject` (et non `@ObservedObject`) : tous les call sites passent
    // par l'init de convenance qui crée le recorder inline — en observed,
    // chaque ré-évaluation du parent remplaçait l'instance observée et
    // orphelinait un AVAudioRecorder live (micro chaud, timer leaké).
    @StateObject private var recorder: Recorder
    @State private var recordedSamples: [RecordedSample] = []
    /// Refus micro : le tap sur « Enregistrer » ne produisait rien du tout.
    @State private var permissionMessage: String?
    /// Langue de lecture, modifiable en cours de route : on ne découvre parfois
    /// qu'au premier essai qu'on préfère s'enregistrer dans une autre langue.
    @State private var spokenLanguage: String
    /// Décalage tiré une seule fois par présentation de la vue. Relu d'une
    /// session à l'autre, un texte est récité de mémoire — donc à plat, sans
    /// l'intonation qu'on cherche justement à capturer.
    @State private var rotation: Int = 0

    public init(recorder: @autoclosure @escaping () -> Recorder, accentColor: String = MeeshyColors.brandPrimaryHex, minimumSamples: Int = 3,
                minimumDurationSeconds: Int = 10, initialLanguage: String? = nil,
                onSamplesReady: (([Data]) -> Void)? = nil) {
        self._recorder = StateObject(wrappedValue: recorder())
        self.accentColor = accentColor
        self.minimumSamples = minimumSamples
        self.minimumDurationSeconds = minimumDurationSeconds
        self.initialLanguage = initialLanguage
        self.onSamplesReady = onSamplesReady
        // Résolu par le catalogue : une langue non couverte retombe sur
        // l'anglais, et le sélecteur doit refléter ce qui est RÉELLEMENT lu.
        self._spokenLanguage = State(
            initialValue: VoiceProfilePrompts.prompts(for: initialLanguage).first?.languageCode
                ?? VoiceProfilePrompts.supportedLanguageCodes.first
                ?? "en"
        )
    }

    /// Texte à lire pour l'échantillon en cours.
    ///
    /// Vient de `VoiceProfilePrompts` (SDK) : cinq séries de deux à trois
    /// phrases par langue, chacune visant un contour prosodique différent —
    /// déclaratif, interrogatif, exclamatif, énumératif, chiffré. La liste
    /// figée d'avant ne portait qu'une phrase déclarative, trop courte pour la
    /// durée minimale exigée, et en français uniquement.
    private var currentPrompt: VoiceProfilePrompts.Prompt? {
        VoiceProfilePrompts.prompt(
            for: spokenLanguage,
            at: recordedSamples.count,
            rotation: rotation
        )
    }

    public var body: some View {
        VStack(spacing: 16) {
            sampleTextCard

            samplesList

            Spacer()

            if let permissionMessage {
                Text(permissionMessage)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(MeeshyColors.error)
                    .multilineTextAlignment(.center)
                    .transition(.opacity)
            }

            // Controls always at the bottom
            recordingControls

            if recordedSamples.count >= minimumSamples {
                submitButton
            }
        }
        .padding(.horizontal, 20)
        .onAppear {
            // Tiré une seule fois : le décalage doit rester stable pendant
            // toute la session, sinon le texte changerait sous les yeux de
            // l'utilisateur entre deux rendus.
            if rotation == 0 {
                rotation = Int.random(in: 0..<max(1, VoiceProfilePrompts.prompts(for: spokenLanguage).count))
            }
        }
        .onDisappear {
            // Dismiss (X du wizard, swipe-down) pendant un enregistrement :
            // sans ce cancel, le micro et la session audio restaient actifs.
            if recorder.isRecording {
                recorder.cancelRecording()
            }
        }
    }

    // MARK: - Sample Text

    private var sampleTextCard: some View {
        VStack(spacing: 8) {
            HStack {
                Image(systemName: "text.quote")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Color(hex: accentColor))
                Text(String(localized: "voiceProfile.recording.readAloud", defaultValue: "Lisez ce texte à voix haute", bundle: .module))
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.secondary)
                Spacer()
                Text("\(recordedSamples.count + 1)/\(minimumSamples)")
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundColor(Color(hex: accentColor))
            }

            if let prompt = currentPrompt {
                Text(prompt.text)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.primary)
                    .multilineTextAlignment(prompt.isRightToLeft ? .trailing : .leading)
                    .frame(maxWidth: .infinity, alignment: prompt.isRightToLeft ? .trailing : .leading)
                    // Le sens de lecture suit le TEXTE, pas l'interface : un
                    // arabophone dont l'app est en français lit quand même de
                    // droite à gauche.
                    .environment(\.layoutDirection, prompt.isRightToLeft ? .rightToLeft : .leftToRight)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(12)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(Color(hex: accentColor).opacity(0.06))
                    )
                    // Sans cette clé, SwiftUI réutilise le rendu précédent et le
                    // texte semble ne pas changer d'un échantillon à l'autre.
                    .id(prompt.text)
            }

            languagePicker
        }
    }

    // MARK: - Langue parlée

    /// La langue dans laquelle on s'enregistre n'est pas celle de l'interface.
    /// Sans ce choix, un hispanophone utilisant l'app en anglais devait lire un
    /// texte anglais — et enregistrait donc une prosodie qui n'est pas la sienne.
    @ViewBuilder
    private var languagePicker: some View {
        let codes = VoiceProfilePrompts.supportedLanguageCodes
        if codes.count > 1 {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(codes, id: \.self) { code in
                        languageChip(code)
                    }
                }
                .padding(.horizontal, 2)
            }
            // Changer de langue en cours d'enregistrement produirait un profil
            // mi-figue mi-raisin : le choix se fige au premier échantillon.
            .disabled(!recordedSamples.isEmpty || recorder.isRecording)
            .opacity(recordedSamples.isEmpty && !recorder.isRecording ? 1 : 0.4)
            .accessibilityLabel(
                String(localized: "voiceProfile.recording.languagePicker",
                       defaultValue: "Langue d'enregistrement", bundle: .module)
            )
        }
    }

    private func languageChip(_ code: String) -> some View {
        let info = LanguageData.allLanguages.first { $0.code == code }
        let isSelected = code == spokenLanguage
        return Button {
            spokenLanguage = code
            HapticFeedback.light()
        } label: {
            Text("\(info?.flag ?? "") \(info?.nativeName ?? code.uppercased())")
                .font(.system(size: 11, weight: isSelected ? .bold : .medium))
                .foregroundColor(isSelected ? Color(hex: accentColor) : .secondary)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(
                    Capsule(style: .continuous)
                        .fill(Color(hex: accentColor).opacity(isSelected ? 0.14 : 0.05))
                )
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }

    // MARK: - Recording Controls

    private var recordingControls: some View {
        VStack(spacing: 12) {
            if recorder.isRecording {
                waveformIndicator
            }

            HStack(spacing: 20) {
                if recorder.isRecording {
                    Text(formattedDuration(recorder.duration))
                        .font(.system(size: 14, weight: .bold, design: .monospaced))
                        .foregroundColor(Color(hex: "FF6B6B"))

                    Spacer()
                }

                Button {
                    if recorder.isRecording {
                        stopRecording()
                    } else {
                        startRecording()
                    }
                } label: {
                    ZStack {
                        Circle()
                            .fill(recorder.isRecording ? Color(hex: "FF6B6B") : Color(hex: accentColor))
                            .frame(width: 64, height: 64)
                            .shadow(color: (recorder.isRecording ? Color(hex: "FF6B6B") : Color(hex: accentColor)).opacity(0.3), radius: 8, y: 2)

                        Image(systemName: recorder.isRecording ? "stop.fill" : "mic.fill")
                            .font(.system(size: 24, weight: .bold))
                            .foregroundColor(.white)
                    }
                }

                if recorder.isRecording {
                    Spacer()

                    Text(String(localized: "voiceProfile.recording.min_duration", defaultValue: "min \(minimumDurationSeconds) s", bundle: .module))
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.secondary)
                }
            }
            .frame(maxWidth: .infinity)
        }
    }

    // MARK: - Waveform

    private var waveformIndicator: some View {
        HStack(spacing: 3) {
            ForEach(0..<15, id: \.self) { i in
                let level: CGFloat = i < recorder.audioLevels.count ? recorder.audioLevels[i] : 0
                RoundedRectangle(cornerRadius: 2)
                    .fill(Color(hex: accentColor).opacity(0.6))
                    .frame(width: 4, height: max(8, 8 + 30 * level))
                    .animation(.spring(response: 0.08, dampingFraction: 0.6), value: level)
            }
        }
        .frame(height: 38)
    }

    // MARK: - Samples List

    private var samplesList: some View {
        VStack(spacing: 6) {
            ForEach(Array(recordedSamples.enumerated()), id: \.element.id) { index, sample in
                HStack(spacing: 10) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 16))
                        .foregroundColor(MeeshyColors.success)

                    Text(String(localized: "voiceProfile.recording.sample", defaultValue: "Échantillon \(index + 1)", bundle: .module))
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(.primary)

                    Spacer()

                    Text(formattedDuration(sample.duration))
                        .font(.system(size: 12, weight: .medium, design: .monospaced))
                        .foregroundColor(.secondary)

                    Button {
                        recordedSamples.remove(at: index)
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 16))
                            .foregroundColor(Color(hex: "FF6B6B").opacity(0.7))
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color(.systemBackground))
                )
            }
        }
    }

    // MARK: - Submit

    private var submitButton: some View {
        Button {
            let data = recordedSamples.compactMap { $0.data }
            onSamplesReady?(data)
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "arrow.forward.circle.fill")
                    .font(.system(size: 16, weight: .semibold))
                Text(String(localized: "voiceProfile.recording.createProfile", defaultValue: "Creer le profil vocal", bundle: .module))
                    .font(.system(size: 15, weight: .semibold))
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color(hex: accentColor))
            )
        }
    }

    // MARK: - Helpers

    private func startRecording() {
        // Demande explicite AVANT d'activer la session : sinon le prompt TCC
        // arrive pendant que l'enregistrement tourne déjà et le premier
        // échantillon vocal est muet. Callback confiné `nonisolated` côté SDK
        // (cf. `DevicePermissions.swift`) — obligatoire sous
        // `defaultIsolation(MainActor)`.
        Task { @MainActor in
            let state = await DevicePermissions.requestMicrophone()
            guard state.isUsable else {
                permissionMessage = state.needsSettingsRedirect
                    ? String(localized: "audio.recorder.micDeniedSettings", defaultValue: "Micro refus\u{00E9} \u{2014} autorisez-le dans R\u{00E9}glages", bundle: .module)
                    : String(localized: "audio.recorder.micDenied", defaultValue: "Permission micro refus\u{00E9}e", bundle: .module)
                return
            }
            permissionMessage = nil
            recorder.configure(with: .voiceSample)
            recorder.startRecording()
        }
    }

    private func stopRecording() {
        let capturedDuration = recorder.duration
        guard let url = recorder.stopRecording() else { return }
        guard capturedDuration >= Double(minimumDurationSeconds) else { return }
        let data = try? Data(contentsOf: url)
        recordedSamples.append(RecordedSample(duration: capturedDuration, data: data, url: url))
    }

    private func formattedDuration(_ duration: TimeInterval) -> String {
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}

// MARK: - Backward-compatible convenience init

extension VoiceRecordingView where Recorder == DefaultSDKAudioRecorder {
    public init(accentColor: String = MeeshyColors.brandPrimaryHex, minimumSamples: Int = 3,
                minimumDurationSeconds: Int = 10, initialLanguage: String? = nil,
                onSamplesReady: (([Data]) -> Void)? = nil) {
        self.init(
            recorder: DefaultSDKAudioRecorder(),
            accentColor: accentColor,
            minimumSamples: minimumSamples,
            minimumDurationSeconds: minimumDurationSeconds,
            initialLanguage: initialLanguage,
            onSamplesReady: onSamplesReady
        )
    }
}

// MARK: - Recorded Sample

struct RecordedSample: Identifiable {
    let id = UUID()
    let duration: TimeInterval
    let data: Data?
    let url: URL?
}
