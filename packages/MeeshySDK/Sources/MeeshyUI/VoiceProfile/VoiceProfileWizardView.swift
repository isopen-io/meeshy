import SwiftUI
import MeeshySDK

public struct VoiceProfileWizardView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel = VoiceProfileWizardViewModel()
    let accentColor: String
    let onComplete: (() -> Void)?

    public init(accentColor: String = "A855F7", onComplete: (() -> Void)? = nil) {
        self.accentColor = accentColor
        self.onComplete = onComplete
    }

    public var body: some View {
        NavigationView {
            ZStack {
                Color(.systemGroupedBackground).ignoresSafeArea()

                VStack(spacing: 0) {
                    progressIndicator
                    stepContent
                }
            }
            .navigationTitle(String(localized: "voiceProfile.wizard.title", defaultValue: "Profil vocal", bundle: .module))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(String(localized: "voiceProfile.wizard.close", defaultValue: "Fermer", bundle: .module)) { dismiss() }
                        .foregroundColor(Color(hex: accentColor))
                }
            }
            .alert(String(localized: "voiceProfile.wizard.errorTitle", defaultValue: "Erreur", bundle: .module), isPresented: .constant(viewModel.errorMessage != nil)) {
                Button(String(localized: "voiceProfile.wizard.ok", defaultValue: "OK", bundle: .module)) { viewModel.errorMessage = nil }
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
        }
    }

    // MARK: - Progress

    private var progressIndicator: some View {
        HStack(spacing: 4) {
            ForEach(VoiceProfileWizardStep.allCases, id: \.rawValue) { step in
                Capsule()
                    .fill(step.rawValue <= viewModel.currentStep.rawValue ? Color(hex: accentColor) : Color.gray.opacity(0.2))
                    .frame(height: 3)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
    }

    // MARK: - Step Content

    @ViewBuilder
    private var stepContent: some View {
        switch viewModel.currentStep {
        case .consent:
            consentStep
        case .ageVerification:
            ageVerificationStep
        case .recording:
            recordingStep
        case .processing:
            processingStep
        case .complete:
            completeStep
        }
    }

    // MARK: - Consent Step

    private var consentStep: some View {
        ScrollView {
            VStack(spacing: 20) {
                Spacer().frame(height: 20)

                Image(systemName: "waveform.and.mic")
                    .font(.system(size: 48))
                    .foregroundColor(Color(hex: accentColor))

                Text(String(localized: "voiceProfile.consent.title", defaultValue: "Clonage vocal", bundle: .module))
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(.primary)

                Text(String(localized: "voiceProfile.consent.description", defaultValue: "Meeshy peut cloner votre voix pour traduire vos messages audio dans d'autres langues avec votre propre voix.", bundle: .module))
                    .font(.system(size: 14))
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 20)

                VStack(alignment: .leading, spacing: 12) {
                    consentPoint(icon: "mic.fill", text: String(localized: "voiceProfile.consent.point1", defaultValue: "Enregistrez quelques echantillons de votre voix", bundle: .module))
                    consentPoint(icon: "brain.head.profile", text: String(localized: "voiceProfile.consent.point2", defaultValue: "Un modele vocal unique est cree a partir de vos echantillons", bundle: .module))
                    consentPoint(icon: "globe", text: String(localized: "voiceProfile.consent.point3", defaultValue: "Vos traductions audio utiliseront votre voix clonee", bundle: .module))
                    consentPoint(icon: "trash.fill", text: String(localized: "voiceProfile.consent.point4", defaultValue: "Vous pouvez supprimer vos donnees vocales a tout moment (RGPD)", bundle: .module))
                    consentPoint(icon: "lock.shield.fill", text: String(localized: "voiceProfile.consent.point5", defaultValue: "Vos echantillons sont chiffres et ne sont jamais partages", bundle: .module))
                }
                .padding(.horizontal, 24)

                Spacer().frame(height: 10)

                Toggle(isOn: $viewModel.consentGiven) {
                    Text(String(localized: "voiceProfile.consent.toggle", defaultValue: "J'accepte que mes echantillons vocaux soient utilises pour creer un profil vocal", bundle: .module))
                        .font(.system(size: 13))
                        .foregroundColor(.primary)
                }
                .tint(Color(hex: accentColor))
                .padding(.horizontal, 24)

                Button {
                    viewModel.advanceFromConsent()
                } label: {
                    Text(String(localized: "voiceProfile.consent.continue", defaultValue: "Continuer", bundle: .module))
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(
                            RoundedRectangle(cornerRadius: 14)
                                .fill(viewModel.consentGiven ? Color(hex: accentColor) : Color.gray.opacity(0.3))
                        )
                }
                .disabled(!viewModel.consentGiven)
                .padding(.horizontal, 24)

                Spacer()
            }
        }
    }

    private func consentPoint(icon: String, text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Color(hex: accentColor))
                .frame(width: 24)
            Text(text)
                .font(.system(size: 13))
                .foregroundColor(.secondary)
        }
    }

    // MARK: - Age Verification Step

    private var ageVerificationStep: some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: "person.badge.shield.checkmark.fill")
                .font(.system(size: 48))
                .foregroundColor(Color(hex: accentColor))

            Text(String(localized: "voiceProfile.age.title", defaultValue: "Verification d'age", bundle: .module))
                .font(.system(size: 22, weight: .bold))

            Text(String(localized: "voiceProfile.age.description", defaultValue: "Le clonage vocal est reserve aux personnes de 18 ans et plus.", bundle: .module))
                .font(.system(size: 14))
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 20)

            DatePicker(String(localized: "voiceProfile.age.birthDate", defaultValue: "Date de naissance", bundle: .module), selection: $viewModel.birthDate, displayedComponents: .date)
                .datePickerStyle(.wheel)
                .labelsHidden()
                .padding(.horizontal, 24)

            Button {
                viewModel.advanceFromAgeVerification()
            } label: {
                Text(String(localized: "voiceProfile.age.verify", defaultValue: "Verifier", bundle: .module))
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(
                        RoundedRectangle(cornerRadius: 14)
                            .fill(viewModel.isAgeVerified ? Color(hex: accentColor) : Color.gray.opacity(0.3))
                    )
            }
            .disabled(!viewModel.isAgeVerified)
            .padding(.horizontal, 24)

            Spacer()
        }
    }

    // MARK: - Recording Step

    private var recordingStep: some View {
        VStack(spacing: 20) {
            Spacer()

            Text(String(localized: "voiceProfile.recording.title", defaultValue: "Enregistrez votre voix", bundle: .module))
                .font(.system(size: 22, weight: .bold))

            Text(String(localized: "voiceProfile.recording.description", defaultValue: "Lisez le texte ci-dessous a voix haute. Enregistrez au moins 3 echantillons de 10 secondes chacun.", bundle: .module))
                .font(.system(size: 13))
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 20)

            VoiceRecordingView(
                accentColor: accentColor,
                minimumSamples: 3,
                minimumDurationSeconds: 10,
                onSamplesReady: { samples in
                    viewModel.voiceSamples = samples
                    viewModel.advanceFromRecording()
                }
            )

            Spacer()
        }
    }

    // MARK: - Processing Step

    private var processingStep: some View {
        VStack(spacing: 24) {
            Spacer()

            ProgressView()
                .scaleEffect(1.5)
                .tint(Color(hex: accentColor))

            Text(String(localized: "voiceProfile.processing.title", defaultValue: "Creation du profil vocal...", bundle: .module))
                .font(.system(size: 18, weight: .semibold))

            Text(String(localized: "voiceProfile.processing.description", defaultValue: "Vos echantillons sont en cours de traitement. Cela peut prendre quelques minutes.", bundle: .module))
                .font(.system(size: 13))
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 30)

            Spacer()
        }
        .task {
            await viewModel.processVoiceProfile()
        }
    }

    // MARK: - Complete Step

    private var completeStep: some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 60))
                .foregroundColor(Color(hex: "2ECC71"))

            Text(String(localized: "voiceProfile.complete.title", defaultValue: "Profil vocal cree !", bundle: .module))
                .font(.system(size: 22, weight: .bold))

            Text(String(localized: "voiceProfile.complete.description", defaultValue: "Vos traductions audio utiliseront desormais votre voix clonee.", bundle: .module))
                .font(.system(size: 14))
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 20)

            Button {
                onComplete?()
                dismiss()
            } label: {
                Text(String(localized: "voiceProfile.complete.finish", defaultValue: "Terminer", bundle: .module))
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(
                        RoundedRectangle(cornerRadius: 14)
                            .fill(Color(hex: accentColor))
                    )
            }
            .padding(.horizontal, 24)

            Spacer()
        }
    }
}

// MARK: - Wizard ViewModel

@MainActor
class VoiceProfileWizardViewModel: ObservableObject {
    @Published var currentStep: VoiceProfileWizardStep = .consent
    @Published var consentGiven = false
    @Published var birthDate = Calendar.current.date(byAdding: .year, value: -20, to: Date()) ?? Date()
    @Published var voiceSamples: [Data] = []
    @Published var errorMessage: String?
    @Published var isProcessing = false

    private let voiceService = VoiceProfileService.shared

    var isAgeVerified: Bool {
        let age = Calendar.current.dateComponents([.year], from: birthDate, to: Date()).year ?? 0
        return age >= 18
    }

    func advanceFromConsent() {
        guard consentGiven else { return }
        withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
            currentStep = .ageVerification
        }
    }

    func advanceFromAgeVerification() {
        guard isAgeVerified else {
            errorMessage = String(localized: "voiceProfile.age.tooYoungError", defaultValue: "Vous devez avoir 18 ans ou plus pour utiliser le clonage vocal.", bundle: .module)
            return
        }
        Task {
            do {
                let formatter = ISO8601DateFormatter()
                let dateStr = formatter.string(from: birthDate)
                _ = try await voiceService.grantConsent(ageVerification: true, birthDate: dateStr)
                withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                    currentStep = .recording
                }
            } catch {
                errorMessage = "Erreur lors de la verification: \(error.localizedDescription)"
            }
        }
    }

    func advanceFromRecording() {
        withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
            currentStep = .processing
        }
    }

    func processVoiceProfile() async {
        isProcessing = true
        do {
            for sample in voiceSamples {
                _ = try await voiceService.uploadSample(audioData: sample, durationMs: 10000)
            }
            try await Task.sleep(nanoseconds: 2_000_000_000)
            withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                currentStep = .complete
            }
        } catch {
            errorMessage = "Erreur lors du traitement: \(error.localizedDescription)"
            withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                currentStep = .recording
            }
        }
        isProcessing = false
    }
}
