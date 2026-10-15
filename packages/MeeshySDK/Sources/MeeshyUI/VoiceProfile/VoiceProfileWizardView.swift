import SwiftUI
import Combine
import MeeshySDK

public struct VoiceProfileWizardView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel = VoiceProfileWizardViewModel()
    let accentColor: String
    let onComplete: (() -> Void)?

    public init(accentColor: String = MeeshyColors.brandPrimaryHex, onComplete: (() -> Void)? = nil) {
        self.accentColor = accentColor
        self.onComplete = onComplete
    }

    public var body: some View {
        NavigationStack {
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
        HStack(spacing: MeeshySpacing.xs) {
            ForEach(VoiceProfileWizardStep.allCases, id: \.rawValue) { step in
                Capsule()
                    .fill(step.rawValue <= viewModel.currentStep.rawValue ? Color(hex: accentColor) : Color.gray.opacity(0.2))
                    .frame(height: 3)
            }
        }
        .padding(.horizontal, MeeshySpacing.xl)
        .padding(.top, MeeshySpacing.md)
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
            VStack(spacing: MeeshySpacing.xl) {
                Spacer().frame(height: 20)

                Image(systemName: "waveform.and.mic")
                    .font(.system(size: MeeshyIconSize.hero))
                    .foregroundColor(Color(hex: accentColor))

                Text(String(localized: "voiceProfile.consent.title", defaultValue: "Clonage vocal", bundle: .module))
                    .font(.system(size: MeeshyFont.titleSize, weight: .bold))
                    .foregroundColor(.primary)

                Text(String(localized: "voiceProfile.consent.description", defaultValue: "Meeshy peut cloner votre voix pour traduire vos messages audio dans d'autres langues avec votre propre voix.", bundle: .module))
                    .font(.system(size: MeeshyFont.labelSize))
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, MeeshySpacing.xl)

                VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                    consentPoint(icon: "mic.fill", text: String(localized: "voiceProfile.consent.point1", defaultValue: "Enregistrez quelques échantillons de votre voix", bundle: .module))
                    consentPoint(icon: "brain.head.profile", text: String(localized: "voiceProfile.consent.point2", defaultValue: "Un modèle vocal unique est créé à partir de vos échantillons", bundle: .module))
                    consentPoint(icon: "globe", text: String(localized: "voiceProfile.consent.point3", defaultValue: "Vos traductions audio utiliseront votre voix clonée", bundle: .module))
                    consentPoint(icon: "trash.fill", text: String(localized: "voiceProfile.consent.point4", defaultValue: "Vous pouvez supprimer vos données vocales à tout moment (RGPD)", bundle: .module))
                    consentPoint(icon: "lock.shield.fill", text: String(localized: "voiceProfile.consent.point5", defaultValue: "Vos échantillons sont chiffrés et ne sont jamais partagés", bundle: .module))
                }
                .padding(.horizontal, MeeshySpacing.xxl)

                Spacer().frame(height: 10)

                Toggle(isOn: $viewModel.consentGiven) {
                    Text(String(localized: "voiceProfile.consent.toggle", defaultValue: "J'accepte que mes échantillons vocaux soient utilisés pour créer un profil vocal", bundle: .module))
                        .font(.system(size: 13))
                        .foregroundColor(.primary)
                }
                .tint(Color(hex: accentColor))
                .padding(.horizontal, MeeshySpacing.xxl)

                Button {
                    viewModel.advanceFromConsent()
                } label: {
                    Text(String(localized: "voiceProfile.consent.continue", defaultValue: "Continuer", bundle: .module))
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, MeeshySpacing.mdPlus)
                        .background(
                            RoundedRectangle(cornerRadius: MeeshyRadius.md)
                                .fill(viewModel.consentGiven ? Color(hex: accentColor) : Color.gray.opacity(0.3))
                        )
                }
                .disabled(!viewModel.consentGiven)
                .padding(.horizontal, MeeshySpacing.xxl)

                Spacer()
            }
        }
    }

    private func consentPoint(icon: String, text: String) -> some View {
        HStack(alignment: .top, spacing: MeeshySpacing.smPlus) {
            Image(systemName: icon)
                .font(.system(size: MeeshyIconSize.sm, weight: .medium))
                .foregroundColor(Color(hex: accentColor))
                .frame(width: 24)
            Text(text)
                .font(.system(size: 13))
                .foregroundColor(.secondary)
        }
    }

    // MARK: - Age Verification Step

    private var ageVerificationStep: some View {
        VStack(spacing: MeeshySpacing.xxl) {
            Spacer()

            Image(systemName: "person.badge.shield.checkmark.fill")
                .font(.system(size: MeeshyIconSize.hero))
                .foregroundColor(Color(hex: accentColor))

            Text(String(localized: "voiceProfile.age.title", defaultValue: "Vérification d'âge", bundle: .module))
                .font(.system(size: MeeshyFont.titleSize, weight: .bold))

            Text(String(localized: "voiceProfile.age.description", defaultValue: "Le clonage vocal est réservé aux personnes de 18 ans et plus.", bundle: .module))
                .font(.system(size: MeeshyFont.labelSize))
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, MeeshySpacing.xl)

            DatePicker(String(localized: "voiceProfile.age.birthDate", defaultValue: "Date de naissance", bundle: .module), selection: $viewModel.birthDate, displayedComponents: .date)
                .datePickerStyle(.wheel)
                .labelsHidden()
                .padding(.horizontal, MeeshySpacing.xxl)

            Button {
                viewModel.advanceFromAgeVerification()
            } label: {
                Text(String(localized: "voiceProfile.age.verify", defaultValue: "Vérifier", bundle: .module))
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, MeeshySpacing.mdPlus)
                    .background(
                        RoundedRectangle(cornerRadius: MeeshyRadius.md)
                            .fill(viewModel.isAgeVerified ? Color(hex: accentColor) : Color.gray.opacity(0.3))
                    )
            }
            .disabled(!viewModel.isAgeVerified)
            .padding(.horizontal, MeeshySpacing.xxl)

            Spacer()
        }
    }

    // MARK: - Recording Step

    private var recordingStep: some View {
        VStack(spacing: MeeshySpacing.xl) {
            Spacer()

            Text(String(localized: "voiceProfile.recording.title", defaultValue: "Enregistrez votre voix", bundle: .module))
                .font(.system(size: MeeshyFont.titleSize, weight: .bold))

            Text(String(localized: "voiceProfile.recording.description", defaultValue: "Lisez à voix haute les deux ou trois phrases affichées, sans forcer le ton. Trois enregistrements de dix secondes suffisent.", bundle: .module))
                .font(.system(size: 13))
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, MeeshySpacing.xl)

            VoiceRecordingView(
                accentColor: accentColor,
                minimumSamples: 3,
                minimumDurationSeconds: 10,
                // La langue PARLÉE, pas celle de l'interface : on part de celle
                // de l'utilisateur, il peut en changer avant le premier
                // enregistrement.
                initialLanguage: AuthManager.shared.currentUser?.systemLanguage,
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
        VStack(spacing: MeeshySpacing.xxl) {
            Spacer()

            ProgressView()
                .scaleEffect(1.5)
                .tint(Color(hex: accentColor))

            Text(String(localized: "voiceProfile.processing.title", defaultValue: "Création du profil vocal...", bundle: .module))
                .font(.system(size: MeeshyFont.subtitleSize, weight: .semibold))

            Text(String(localized: "voiceProfile.processing.description", defaultValue: "Vos échantillons sont en cours de traitement. Cela peut prendre quelques minutes.", bundle: .module))
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
        VStack(spacing: MeeshySpacing.xxl) {
            Spacer()

            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 60))
                .foregroundColor(MeeshyColors.success)

            Text(String(localized: "voiceProfile.complete.title", defaultValue: "Profil vocal créé !", bundle: .module))
                .font(.system(size: MeeshyFont.titleSize, weight: .bold))

            Text(String(localized: "voiceProfile.complete.description", defaultValue: "Vos traductions audio utiliseront désormais votre voix clonée.", bundle: .module))
                .font(.system(size: MeeshyFont.labelSize))
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, MeeshySpacing.xl)

            Button {
                onComplete?()
                dismiss()
            } label: {
                Text(String(localized: "voiceProfile.complete.finish", defaultValue: "Terminer", bundle: .module))
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, MeeshySpacing.mdPlus)
                    .background(
                        RoundedRectangle(cornerRadius: MeeshyRadius.md)
                            .fill(Color(hex: accentColor))
                    )
            }
            .padding(.horizontal, MeeshySpacing.xxl)

            Spacer()
        }
    }
}

// MARK: - Wizard ViewModel

@MainActor
class VoiceProfileWizardViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
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
                // Le gateway valide `birthDate` en `format: 'date'` strict
                // (YYYY-MM-DD) — un ISO8601 complet (avec heure) serait rejeté.
                var calendar = Calendar(identifier: .gregorian)
                calendar.timeZone = TimeZone(identifier: "UTC") ?? .current
                let c = calendar.dateComponents([.year, .month, .day], from: birthDate)
                let dateStr = String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
                _ = try await voiceService.grantConsent(voiceCloningConsent: false, birthDate: dateStr)
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
            try await Task.sleep(for: .seconds(2))
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
