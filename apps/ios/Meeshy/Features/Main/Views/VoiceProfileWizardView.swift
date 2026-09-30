import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct VoiceProfileWizardView: View {
    let accentColor: String

    /// La teinte d'accent, convertie UNE fois : chaque site la répétait en
    /// `Color(hex:)`, et le cliquet des couleurs en dur le comptait autant de fois
    /// (+3 introduits par #6481, 2026-09-14).
    private var accent: Color { Color(hex: accentColor) }

    @Environment(\.dismiss) private var dismiss
    private var theme: ThemeManager { ThemeManager.shared }
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
        .adaptiveOnChange(of: viewModel.currentStep) { _, newStep in
            // Chaque étape remplace TOUT le contenu de l'écran (consent → âge →
            // enregistrement → traitement → terminé) sans que VoiceOver ne
            // déplace le focus ni n'annonce le changement — l'utilisateur non
            // voyant resterait bloqué sur l'ancien focus. On poste
            // `.screenChanged` (parité `IncomingCallView`) : VoiceOver refocalise
            // sur le nouveau contenu et annonce le titre de l'étape. Les 5 libellés
            // réutilisent l'i18n déjà présent dans les étapes (0 clé neuve).
            UIAccessibility.post(
                notification: .screenChanged,
                argument: stepAnnouncement(for: newStep)
            )
        }
    }

    private func stepAnnouncement(for step: VoiceProfileWizardStep) -> String {
        switch step {
        case .consent:
            return String(localized: "voice.profile.wizard.title", defaultValue: "Profil vocal", bundle: .main)
        case .ageVerification:
            return String(localized: "voice.profile.wizard.ageVerification", defaultValue: "Vérification de l'âge", bundle: .main)
        case .recording:
            return String(localized: "voice.profile.wizard.recording.title", defaultValue: "Enregistrez votre voix", bundle: .main)
        case .processing:
            return String(localized: "voice.profile.wizard.analyzing", defaultValue: "Analyse en cours…", bundle: .main)
        case .complete:
            return String(localized: "voice.profile.wizard.created", defaultValue: "Profil vocal créé !", bundle: .main)
        }
    }

    // MARK: - Header

    /// En-tête partagé, FIXE (`scrollOffset: 0`), la progression juste dessous
    /// (#6481). Il nomme la PAGE, pas l'étape : chaque étape affiche déjà son
    /// propre titre dans son contenu, le répéter ici l'écrirait deux fois. Le
    /// retour en verre ferme le parcours, comme la croix qu'il remplace ; la
    /// navigation entre étapes reste portée par les boutons de chaque étape.
    private var header: some View {
        VStack(spacing: 0) {
            CollapsibleHeader(
                title: String(localized: "voice.profile.wizard.title", defaultValue: "Profil vocal", bundle: .main),
                scrollOffset: 0,
                onBack: { dismiss() },
                titleColor: theme.textPrimary,
                backArrowColor: accent,
                backgroundColor: theme.backgroundPrimary,
                trailing: { EmptyView() }
            )

            stepIndicator
                .padding(.horizontal, MeeshySpacing.lg)
                .padding(.top, MeeshySpacing.xs)
                .padding(.bottom, MeeshySpacing.sm)
        }
    }

    private var stepIndicator: some View {
        HStack(spacing: MeeshySpacing.xs) {
            ForEach(VoiceProfileWizardStep.allCases, id: \.rawValue) { step in
                Capsule()
                    .fill(step.rawValue <= viewModel.currentStep.rawValue
                          ? accent
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
            VStack(spacing: MeeshySpacing.xxl) {
                Spacer().frame(height: 20)

                Image(systemName: "waveform.circle.fill")
                    .font(.system(size: 64)) // icône héros décorative — figée (≥40pt)
                    .foregroundStyle(
                        LinearGradient(
                            colors: [accent, accent.opacity(0.7)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .accessibilityHidden(true)

                Text(String(localized: "voice.profile.wizard.title", defaultValue: "Profil vocal", bundle: .main))
                    .font(MeeshyFont.relative(24, weight: .bold, design: .rounded))
                    .foregroundColor(theme.textPrimary)

                Text(String(localized: "voice.profile.wizard.intro", defaultValue: "Enregistrez votre voix pour activer le clonage vocal personnalisé. Vos messages audio traduits garderont votre voix naturelle.", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize))
                    .multilineTextAlignment(.center)
                    .foregroundColor(theme.textSecondary)
                    .padding(.horizontal, MeeshySpacing.xxl)

                VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                    consentInfoRow(icon: "mic.fill", text: String(localized: "voice.profile.wizard.consent.samples", defaultValue: "3 échantillons vocaux de 10 secondes minimum", bundle: .main))
                    consentInfoRow(icon: "lock.shield.fill", text: String(localized: "voice.profile.wizard.consent.encrypted", defaultValue: "Données chiffrées et stockées de manière sécurisée", bundle: .main))
                    consentInfoRow(icon: "trash.fill", text: String(localized: "voice.profile.wizard.consent.rgpd", defaultValue: "Suppression possible à tout moment (RGPD)", bundle: .main))
                    consentInfoRow(icon: "waveform.path", text: String(localized: "voice.profile.wizard.consent.use", defaultValue: "Utilisé pour générer des traductions avec votre voix", bundle: .main))
                }
                .padding(MeeshySpacing.lg)
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                        .fill(theme.backgroundSecondary)
                )
                .padding(.horizontal, MeeshySpacing.xl)

                if let error = viewModel.error {
                    Text(error)
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                        .foregroundColor(MeeshyColors.error)
                        .padding(.horizontal, MeeshySpacing.xl)
                }

                Button {
                    HapticFeedback.medium()
                    viewModel.proceedToAgeVerification()
                } label: {
                    HStack(spacing: MeeshySpacing.sm) {
                        if viewModel.isLoading {
                            ProgressView()
                                .tint(.white)
                        }
                        Text(String(localized: "voice.profile.wizard.acceptContinue", defaultValue: "J'accepte et je continue", bundle: .main))
                            .font(MeeshyFont.relative(MeeshyFont.calloutSize, weight: .semibold))
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, MeeshySpacing.lg)
                    .background(
                        RoundedRectangle(cornerRadius: MeeshyRadius.md)
                            .fill(accent)
                    )
                }
                .disabled(viewModel.isLoading)
                .padding(.horizontal, MeeshySpacing.xl)

                Spacer().frame(height: 32)
            }
        }
    }

    private func consentInfoRow(icon: String, text: String) -> some View {
        HStack(spacing: MeeshySpacing.md) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(MeeshyIconSize.sm))
                .foregroundColor(accent)
                .frame(width: 24)
                .accessibilityHidden(true) // glyphe décoratif — le texte porte l'information
            Text(text)
                .font(MeeshyFont.relative(MeeshyFont.labelSize))
                .foregroundColor(theme.textSecondary)
        }
    }

    // MARK: - Age Verification Step

    private var ageVerificationStep: some View {
        VStack(spacing: MeeshySpacing.xxl) {
            Spacer()

            Image(systemName: "person.badge.shield.checkmark.fill")
                .font(.system(size: 64)) // icône héros décorative — figée (≥40pt)
                .foregroundColor(accent)
                .accessibilityHidden(true)

            Text(String(localized: "voice.profile.wizard.ageVerification", defaultValue: "Vérification de l'âge", bundle: .main))
                .font(MeeshyFont.relative(24, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            Text(String(localized: "voice.profile.wizard.ageVerification.description", defaultValue: "Le clonage vocal nécessite une vérification d'âge pour les mineurs.", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.bodySize))
                .multilineTextAlignment(.center)
                .foregroundColor(theme.textSecondary)
                .padding(.horizontal, MeeshySpacing.xxxl)

            DatePicker(String(localized: "voice.profile.wizard.birthDate", defaultValue: "Date de naissance", bundle: .main), selection: $viewModel.birthDate, displayedComponents: .date)
                .datePickerStyle(.wheel)
                .labelsHidden()
                .padding(.horizontal, MeeshySpacing.xl)

            Button {
                HapticFeedback.medium()
                Task { await viewModel.grantConsent() }
            } label: {
                HStack(spacing: MeeshySpacing.sm) {
                    if viewModel.isLoading {
                        ProgressView().tint(.white)
                    }
                    Text(String(localized: "voice.profile.wizard.confirm", defaultValue: "Confirmer", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.calloutSize, weight: .semibold))
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, MeeshySpacing.lg)
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.md)
                        .fill(accent)
                )
            }
            .disabled(viewModel.isLoading)
            .padding(.horizontal, MeeshySpacing.xl)

            if let error = viewModel.error {
                Text(error)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                    .foregroundColor(MeeshyColors.error)
                    .padding(.horizontal, MeeshySpacing.xl)
            }

            Spacer()
        }
    }

    // MARK: - Recording Step

    private var recordingStep: some View {
        ScrollView {
            VStack(spacing: MeeshySpacing.xl) {
                Spacer().frame(height: 16)

                Text(String(localized: "voice.profile.wizard.recording.title", defaultValue: "Enregistrez votre voix", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold, design: .rounded))
                    .foregroundColor(theme.textPrimary)

                Text(String(localized: "voice.profile.wizard.recording.description", defaultValue: "Lisez à voix haute les deux ou trois phrases affichées, sans forcer le ton. Minimum 3 échantillons de 10 secondes.", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.labelSize))
                    .multilineTextAlignment(.center)
                    .foregroundColor(theme.textSecondary)
                    .padding(.horizontal, MeeshySpacing.xxl)

                VoiceRecordingView(
                    accentColor: accentColor,
                    minimumSamples: 3,
                    minimumDurationSeconds: 10,
                    // La langue PARLÉE, pas celle de l'interface.
                    initialLanguage: AuthManager.shared.currentUser?.systemLanguage
                ) { audioDataList in
                    HapticFeedback.success()
                    Task { await viewModel.uploadSamples(audioDataList) }
                }

                if let error = viewModel.error {
                    Text(error)
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                        .foregroundColor(MeeshyColors.error)
                        .padding(.horizontal, MeeshySpacing.xl)
                }

                Spacer().frame(height: 32)
            }
        }
    }

    // MARK: - Processing Step

    private var processingStep: some View {
        VStack(spacing: MeeshySpacing.xxl) {
            Spacer()

            ProgressView()
                .scaleEffect(1.5)
                .tint(accent)

            Text(String(localized: "voice.profile.wizard.analyzing", defaultValue: "Analyse en cours…", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            if viewModel.totalToUpload > 0 {
                Text(String(localized: "voice.profile.wizard.uploadProgress", defaultValue: "Envoi \(viewModel.uploadedCount)/\(viewModel.totalToUpload) échantillons", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .medium, design: .monospaced))
                    .foregroundColor(theme.textSecondary)

                ProgressView(value: Double(viewModel.uploadedCount), total: Double(viewModel.totalToUpload))
                    .tint(accent)
                    .padding(.horizontal, 60)
            }

            Text(String(localized: "voice.profile.wizard.creating", defaultValue: "Votre profil vocal est en cours de création. Cela peut prendre quelques instants.", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.labelSize))
                .multilineTextAlignment(.center)
                .foregroundColor(theme.textMuted)
                .padding(.horizontal, MeeshySpacing.xxxl)

            if let error = viewModel.error {
                Text(error)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                    .foregroundColor(MeeshyColors.error)
            }

            Spacer()
        }
    }

    // MARK: - Complete Step

    private var completeStep: some View {
        VStack(spacing: MeeshySpacing.xxl) {
            Spacer()

            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 72)) // icône héros décorative — figée (≥40pt)
                .foregroundColor(MeeshyColors.success)
                .accessibilityHidden(true)

            Text(String(localized: "voice.profile.wizard.created", defaultValue: "Profil vocal créé !", bundle: .main))
                .font(MeeshyFont.relative(24, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            if let profile = viewModel.profile {
                VStack(spacing: MeeshySpacing.sm) {
                    profileInfoRow(label: String(localized: "voice.profile.samples", defaultValue: "Échantillons", bundle: .main), value: "\(profile.sampleCount)")
                    profileInfoRow(label: String(localized: "voice.profile.totalDuration", defaultValue: "Durée totale", bundle: .main), value: "\(profile.totalDurationSeconds)s")
                    if let quality = profile.quality {
                        profileInfoRow(label: String(localized: "voice.profile.quality", defaultValue: "Qualité", bundle: .main), value: "\(Int(quality * 100))%")
                    }
                    profileInfoRow(label: String(localized: "voice.profile.status", defaultValue: "Statut", bundle: .main), value: profile.status.rawValue.capitalized)
                }
                .padding(MeeshySpacing.lg)
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                        .fill(theme.backgroundSecondary)
                )
                .padding(.horizontal, MeeshySpacing.xl)
            }

            Text(String(localized: "voice.profile.wizard.success.message", defaultValue: "Vos messages audio traduits utiliseront désormais votre voix clonée.", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.labelSize))
                .multilineTextAlignment(.center)
                .foregroundColor(theme.textSecondary)
                .padding(.horizontal, MeeshySpacing.xxxl)

            Button {
                HapticFeedback.success()
                dismiss()
            } label: {
                Text(String(localized: "voice.profile.wizard.finish", defaultValue: "Terminer", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.calloutSize, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, MeeshySpacing.lg)
                    .background(
                        RoundedRectangle(cornerRadius: MeeshyRadius.md)
                            .fill(accent)
                    )
            }
            .padding(.horizontal, MeeshySpacing.xl)

            Spacer()
        }
    }

    private func profileInfoRow(label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(MeeshyFont.relative(MeeshyFont.labelSize))
                .foregroundColor(theme.textSecondary)
            Spacer()
            Text(value)
                .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold))
                .foregroundColor(theme.textPrimary)
        }
        .accessibilityElement(children: .combine)
    }
}
