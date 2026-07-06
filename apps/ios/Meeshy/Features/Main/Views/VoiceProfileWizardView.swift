import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct VoiceProfileWizardView: View {
    let accentColor: String

    @Environment(\.dismiss) private var dismiss
    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    @StateObject private var viewModel = VoiceProfileWizardViewModel()

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                header

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
        }
        .task {
            await viewModel.checkConsent()
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            stepIndicator
            Spacer()
            Button {
                HapticFeedback.light()
                dismiss()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 28)) // chrome control (cadre de tap fixe) — figé comme les xmark/transport (82i)
                    .foregroundStyle(theme.textMuted)
            }
            .accessibilityLabel(String(localized: "common.close", defaultValue: "Fermer", bundle: .main))
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 8)
    }

    private var stepIndicator: some View {
        HStack(spacing: 4) {
            ForEach(VoiceProfileWizardStep.allCases, id: \.rawValue) { step in
                Capsule()
                    .fill(step.rawValue <= viewModel.currentStep.rawValue
                          ? Color(hex: accentColor)
                          : theme.textMuted.opacity(0.3))
                    .frame(height: 3)
            }
        }
        .frame(maxWidth: 200)
        .accessibilityHidden(true) // barre de progression décorative (3pt) — chaque étape s'annonce par son contenu
    }

    // MARK: - Consent Step

    private var consentStep: some View {
        ScrollView {
            VStack(spacing: 24) {
                Spacer().frame(height: 20)

                Image(systemName: "waveform.circle.fill")
                    .font(.system(size: 64)) // icône héros décorative — figée (≥40pt)
                    .foregroundStyle(
                        LinearGradient(
                            colors: [Color(hex: accentColor), Color(hex: accentColor).opacity(0.7)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .accessibilityHidden(true)

                Text(String(localized: "voice.profile.wizard.title", defaultValue: "Profil vocal", bundle: .main))
                    .font(MeeshyFont.relative(24, weight: .bold, design: .rounded))
                    .foregroundColor(theme.textPrimary)

                Text(String(localized: "voice.profile.wizard.intro", defaultValue: "Enregistrez votre voix pour activer le clonage vocal personnalise. Vos messages audio traduits garderont votre voix naturelle.", bundle: .main))
                    .font(MeeshyFont.relative(15))
                    .multilineTextAlignment(.center)
                    .foregroundColor(theme.textSecondary)
                    .padding(.horizontal, 24)

                VStack(alignment: .leading, spacing: 12) {
                    consentInfoRow(icon: "mic.fill", text: String(localized: "voice.profile.wizard.consent.samples", defaultValue: "3 echantillons vocaux de 10 secondes minimum", bundle: .main))
                    consentInfoRow(icon: "lock.shield.fill", text: String(localized: "voice.profile.wizard.consent.encrypted", defaultValue: "Donnees chiffrees et stockees de maniere securisee", bundle: .main))
                    consentInfoRow(icon: "trash.fill", text: String(localized: "voice.profile.wizard.consent.rgpd", defaultValue: "Suppression possible a tout moment (RGPD)", bundle: .main))
                    consentInfoRow(icon: "waveform.path", text: String(localized: "voice.profile.wizard.consent.use", defaultValue: "Utilise pour generer des traductions avec votre voix", bundle: .main))
                }
                .padding(16)
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(theme.backgroundSecondary)
                )
                .padding(.horizontal, 20)

                if let error = viewModel.error {
                    Text(error)
                        .font(MeeshyFont.relative(13, weight: .medium))
                        .foregroundColor(MeeshyColors.error)
                        .padding(.horizontal, 20)
                }

                Button {
                    HapticFeedback.medium()
                    Task { await viewModel.grantConsent() }
                } label: {
                    HStack(spacing: 8) {
                        if viewModel.isLoading {
                            ProgressView()
                                .tint(.white)
                        }
                        Text(String(localized: "voice.profile.wizard.acceptContinue", defaultValue: "J'accepte et je continue", bundle: .main))
                            .font(MeeshyFont.relative(16, weight: .semibold))
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(
                        RoundedRectangle(cornerRadius: 14)
                            .fill(Color(hex: accentColor))
                    )
                }
                .disabled(viewModel.isLoading)
                .padding(.horizontal, 20)

                Spacer().frame(height: 32)
            }
        }
    }

    private func consentInfoRow(icon: String, text: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(14))
                .foregroundColor(Color(hex: accentColor))
                .frame(width: 24)
                .accessibilityHidden(true) // glyphe décoratif — le texte porte l'information
            Text(text)
                .font(MeeshyFont.relative(14))
                .foregroundColor(theme.textSecondary)
        }
    }

    // MARK: - Age Verification Step

    private var ageVerificationStep: some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: "person.badge.shield.checkmark.fill")
                .font(.system(size: 64)) // icône héros décorative — figée (≥40pt)
                .foregroundColor(Color(hex: accentColor))
                .accessibilityHidden(true)

            Text(String(localized: "voice.profile.wizard.ageVerification", defaultValue: "Verification de l'age", bundle: .main))
                .font(MeeshyFont.relative(24, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            Text(String(localized: "voice.profile.wizard.ageVerification.description", defaultValue: "Le clonage vocal necessite une verification d'age pour les mineurs.", bundle: .main))
                .font(MeeshyFont.relative(15))
                .multilineTextAlignment(.center)
                .foregroundColor(theme.textSecondary)
                .padding(.horizontal, 32)

            DatePicker(String(localized: "voice.profile.wizard.birthDate", defaultValue: "Date de naissance", bundle: .main), selection: $viewModel.birthDate, displayedComponents: .date)
                .datePickerStyle(.wheel)
                .labelsHidden()
                .padding(.horizontal, 20)

            Button {
                HapticFeedback.medium()
                viewModel.confirmAgeVerification()
            } label: {
                Text(String(localized: "voice.profile.wizard.confirm", defaultValue: "Confirmer", bundle: .main))
                    .font(MeeshyFont.relative(16, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(
                        RoundedRectangle(cornerRadius: 14)
                            .fill(Color(hex: accentColor))
                    )
            }
            .padding(.horizontal, 20)

            Spacer()
        }
    }

    // MARK: - Recording Step

    private var recordingStep: some View {
        ScrollView {
            VStack(spacing: 20) {
                Spacer().frame(height: 16)

                Text(String(localized: "voice.profile.wizard.recording.title", defaultValue: "Enregistrez votre voix", bundle: .main))
                    .font(MeeshyFont.relative(22, weight: .bold, design: .rounded))
                    .foregroundColor(theme.textPrimary)

                Text(String(localized: "voice.profile.wizard.recording.description", defaultValue: "Lisez les phrases affichees a voix haute. Minimum 3 echantillons de 10 secondes.", bundle: .main))
                    .font(MeeshyFont.relative(14))
                    .multilineTextAlignment(.center)
                    .foregroundColor(theme.textSecondary)
                    .padding(.horizontal, 24)

                VoiceRecordingView(
                    accentColor: accentColor,
                    minimumSamples: 3,
                    minimumDurationSeconds: 10
                ) { audioDataList in
                    HapticFeedback.success()
                    Task { await viewModel.uploadSamples(audioDataList) }
                }

                Spacer().frame(height: 32)
            }
        }
    }

    // MARK: - Processing Step

    private var processingStep: some View {
        VStack(spacing: 24) {
            Spacer()

            ProgressView()
                .scaleEffect(1.5)
                .tint(Color(hex: accentColor))

            Text(String(localized: "voice.profile.wizard.analyzing", defaultValue: "Analyse en cours...", bundle: .main))
                .font(MeeshyFont.relative(22, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            if viewModel.totalToUpload > 0 {
                Text(String(localized: "voice.profile.wizard.uploadProgress", defaultValue: "Envoi \(viewModel.uploadedCount)/\(viewModel.totalToUpload) echantillons", bundle: .main))
                    .font(MeeshyFont.relative(14, weight: .medium, design: .monospaced))
                    .foregroundColor(theme.textSecondary)

                ProgressView(value: Double(viewModel.uploadedCount), total: Double(viewModel.totalToUpload))
                    .tint(Color(hex: accentColor))
                    .padding(.horizontal, 60)
            }

            Text(String(localized: "voice.profile.wizard.creating", defaultValue: "Votre profil vocal est en cours de creation. Cela peut prendre quelques instants.", bundle: .main))
                .font(MeeshyFont.relative(14))
                .multilineTextAlignment(.center)
                .foregroundColor(theme.textMuted)
                .padding(.horizontal, 32)

            if let error = viewModel.error {
                Text(error)
                    .font(MeeshyFont.relative(13, weight: .medium))
                    .foregroundColor(MeeshyColors.error)
            }

            Spacer()
        }
    }

    // MARK: - Complete Step

    private var completeStep: some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 72)) // icône héros décorative — figée (≥40pt)
                .foregroundColor(MeeshyColors.success)
                .accessibilityHidden(true)

            Text(String(localized: "voice.profile.wizard.created", defaultValue: "Profil vocal cree !", bundle: .main))
                .font(MeeshyFont.relative(24, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            if let profile = viewModel.profile {
                VStack(spacing: 8) {
                    profileInfoRow(label: String(localized: "voice.profile.samples", defaultValue: "Echantillons", bundle: .main), value: "\(profile.sampleCount)")
                    profileInfoRow(label: String(localized: "voice.profile.totalDuration", defaultValue: "Duree totale", bundle: .main), value: "\(profile.totalDurationSeconds)s")
                    if let quality = profile.quality {
                        profileInfoRow(label: String(localized: "voice.profile.quality", defaultValue: "Qualite", bundle: .main), value: "\(Int(quality * 100))%")
                    }
                    profileInfoRow(label: String(localized: "voice.profile.status", defaultValue: "Statut", bundle: .main), value: profile.status.rawValue.capitalized)
                }
                .padding(16)
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(theme.backgroundSecondary)
                )
                .padding(.horizontal, 20)
            }

            Text(String(localized: "voice.profile.wizard.success.message", defaultValue: "Vos messages audio traduits utiliseront desormais votre voix clonee.", bundle: .main))
                .font(MeeshyFont.relative(14))
                .multilineTextAlignment(.center)
                .foregroundColor(theme.textSecondary)
                .padding(.horizontal, 32)

            Button {
                HapticFeedback.success()
                dismiss()
            } label: {
                Text(String(localized: "voice.profile.wizard.finish", defaultValue: "Terminer", bundle: .main))
                    .font(MeeshyFont.relative(16, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(
                        RoundedRectangle(cornerRadius: 14)
                            .fill(Color(hex: accentColor))
                    )
            }
            .padding(.horizontal, 20)

            Spacer()
        }
    }

    private func profileInfoRow(label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(MeeshyFont.relative(14))
                .foregroundColor(theme.textSecondary)
            Spacer()
            Text(value)
                .font(MeeshyFont.relative(14, weight: .semibold))
                .foregroundColor(theme.textPrimary)
        }
        .accessibilityElement(children: .combine)
    }
}
