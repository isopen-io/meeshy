import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct VoiceProfileWizardView: View {
    let accentColor: String

    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared
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
                    .font(.system(size: 28))
                    .foregroundStyle(theme.textMuted)
            }
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
    }

    // MARK: - Consent Step

    private var consentStep: some View {
        ScrollView {
            VStack(spacing: 24) {
                Spacer().frame(height: 20)

                Image(systemName: "waveform.circle.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [Color(hex: accentColor), Color(hex: accentColor).opacity(0.7)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )

                Text("Profil vocal")
                    .font(.system(size: 24, weight: .bold, design: .rounded))
                    .foregroundColor(theme.textPrimary)

                Text("Enregistrez votre voix pour activer le clonage vocal personnalise. Vos messages audio traduits garderont votre voix naturelle.")
                    .font(.system(size: 15))
                    .multilineTextAlignment(.center)
                    .foregroundColor(theme.textSecondary)
                    .padding(.horizontal, 24)

                VStack(alignment: .leading, spacing: 12) {
                    consentInfoRow(icon: "mic.fill", text: "3 echantillons vocaux de 10 secondes minimum")
                    consentInfoRow(icon: "lock.shield.fill", text: "Donnees chiffrees et stockees de maniere securisee")
                    consentInfoRow(icon: "trash.fill", text: "Suppression possible a tout moment (RGPD)")
                    consentInfoRow(icon: "waveform.path", text: "Utilise pour generer des traductions avec votre voix")
                }
                .padding(16)
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(theme.backgroundSecondary)
                )
                .padding(.horizontal, 20)

                if let error = viewModel.error {
                    Text(error)
                        .font(.system(size: 13, weight: .medium))
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
                        Text("J'accepte et je continue")
                            .font(.system(size: 16, weight: .semibold))
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
                .font(.system(size: 14))
                .foregroundColor(Color(hex: accentColor))
                .frame(width: 24)
            Text(text)
                .font(.system(size: 14))
                .foregroundColor(theme.textSecondary)
        }
    }

    // MARK: - Age Verification Step

    private var ageVerificationStep: some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: "person.badge.shield.checkmark.fill")
                .font(.system(size: 64))
                .foregroundColor(Color(hex: accentColor))

            Text("Verification de l'age")
                .font(.system(size: 24, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            Text("Le clonage vocal necessite une verification d'age pour les mineurs.")
                .font(.system(size: 15))
                .multilineTextAlignment(.center)
                .foregroundColor(theme.textSecondary)
                .padding(.horizontal, 32)

            DatePicker("Date de naissance", selection: $viewModel.birthDate, displayedComponents: .date)
                .datePickerStyle(.wheel)
                .labelsHidden()
                .padding(.horizontal, 20)

            Button {
                HapticFeedback.medium()
                viewModel.confirmAgeVerification()
            } label: {
                Text("Confirmer")
                    .font(.system(size: 16, weight: .semibold))
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

                Text("Enregistrez votre voix")
                    .font(.system(size: 22, weight: .bold, design: .rounded))
                    .foregroundColor(theme.textPrimary)

                Text("Lisez les phrases affichees a voix haute. Minimum 3 echantillons de 10 secondes.")
                    .font(.system(size: 14))
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

            Text("Analyse en cours...")
                .font(.system(size: 22, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            if viewModel.totalToUpload > 0 {
                Text("Envoi \(viewModel.uploadedCount)/\(viewModel.totalToUpload) echantillons")
                    .font(.system(size: 14, weight: .medium, design: .monospaced))
                    .foregroundColor(theme.textSecondary)

                ProgressView(value: Double(viewModel.uploadedCount), total: Double(viewModel.totalToUpload))
                    .tint(Color(hex: accentColor))
                    .padding(.horizontal, 60)
            }

            Text("Votre profil vocal est en cours de creation. Cela peut prendre quelques instants.")
                .font(.system(size: 14))
                .multilineTextAlignment(.center)
                .foregroundColor(theme.textMuted)
                .padding(.horizontal, 32)

            if let error = viewModel.error {
                Text(error)
                    .font(.system(size: 13, weight: .medium))
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
                .font(.system(size: 72))
                .foregroundColor(MeeshyColors.success)

            Text("Profil vocal cree !")
                .font(.system(size: 24, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            if let profile = viewModel.profile {
                VStack(spacing: 8) {
                    profileInfoRow(label: "Echantillons", value: "\(profile.sampleCount)")
                    profileInfoRow(label: "Duree totale", value: "\(profile.totalDurationSeconds)s")
                    if let quality = profile.quality {
                        profileInfoRow(label: "Qualite", value: "\(Int(quality * 100))%")
                    }
                    profileInfoRow(label: "Statut", value: profile.status.rawValue.capitalized)
                }
                .padding(16)
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(theme.backgroundSecondary)
                )
                .padding(.horizontal, 20)
            }

            Text("Vos messages audio traduits utiliseront desormais votre voix clonee.")
                .font(.system(size: 14))
                .multilineTextAlignment(.center)
                .foregroundColor(theme.textSecondary)
                .padding(.horizontal, 32)

            Button {
                HapticFeedback.success()
                dismiss()
            } label: {
                Text("Terminer")
                    .font(.system(size: 16, weight: .semibold))
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
                .font(.system(size: 14))
                .foregroundColor(theme.textSecondary)
            Spacer()
            Text(value)
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(theme.textPrimary)
        }
    }
}
