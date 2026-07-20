import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct VoiceProfileManageView: View {
    let accentColor: String

    @Environment(\.dismiss) private var dismiss
    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    @StateObject private var viewModel = VoiceProfileManageViewModel()
    @State private var showDeleteConfirmation = false
    @State private var showAddSamples = false
    @State private var showWizard = false

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                header

                if viewModel.isLoading && viewModel.profile == nil {
                    loadingView
                } else if let profile = viewModel.profile {
                    profileContent(profile)
                } else {
                    emptyState
                }
            }
        }
        .task {
            await viewModel.loadProfile()
        }
        .alert(String(localized: "voice.profile.deleteAlert.title", defaultValue: "Supprimer le profil vocal", bundle: .main), isPresented: $showDeleteConfirmation) {
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) {}
            Button(String(localized: "voice.profile.delete", defaultValue: "Supprimer", bundle: .main), role: .destructive) {
                Task { await viewModel.deleteProfile() }
            }
        } message: {
            Text(String(localized: "voice.profile.deleteAlert.message", defaultValue: "Cette action est irreversible. Toutes vos donnees vocales seront supprimees conformement au RGPD.", bundle: .main))
        }
        .sheet(isPresented: $showAddSamples) {
            addSamplesSheet
        }
        .sheet(isPresented: $showWizard) {
            VoiceProfileWizardView(accentColor: accentColor)
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Text(String(localized: "voice.profile.title", defaultValue: "Profil vocal", bundle: .main))
                .font(MeeshyFont.relative(20, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)
            Spacer()
            Button {
                HapticFeedback.light()
                dismiss()
            } label: {
                // Chrome de fermeture : glyphe dans une affordance de tap d'en-tête —
                // gardé figé, doctrine 82i/87i. Libellé VoiceOver ajouté (146i).
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 28))
                    .foregroundStyle(theme.textMuted)
            }
            .accessibilityLabel(String(localized: "common.close", defaultValue: "Fermer", bundle: .main))
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 8)
    }

    // MARK: - Loading

    private var loadingView: some View {
        VStack {
            Spacer()
            ProgressView()
                .scaleEffect(1.2)
                .tint(Color(hex: accentColor))
            Spacer()
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 24) {
            Spacer()

            // Héros décoratif ≥40pt : taille fixe assumée (doctrine 84i), masqué à VoiceOver (146i).
            Image(systemName: "person.wave.2.fill")
                .font(.system(size: 64))
                .foregroundStyle(
                    LinearGradient(
                        colors: [Color(hex: accentColor), Color(hex: accentColor).opacity(0.7)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .accessibilityHidden(true)

            Text(String(localized: "voice.profile.empty.title", defaultValue: "Aucun profil vocal", bundle: .main))
                .font(MeeshyFont.relative(22, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            Text(String(localized: "voice.profile.empty.description", defaultValue: "Creez un profil vocal pour que vos messages traduits conservent votre voix naturelle.", bundle: .main))
                .font(MeeshyFont.relative(15))
                .multilineTextAlignment(.center)
                .foregroundColor(theme.textSecondary)
                .padding(.horizontal, 32)

            Button {
                HapticFeedback.medium()
                showWizard = true
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "plus.circle.fill")
                        .font(MeeshyFont.relative(16))
                    Text(String(localized: "voice.profile.create", defaultValue: "Creer un profil vocal", bundle: .main))
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
            .padding(.horizontal, 20)

            Spacer()
        }
    }

    // MARK: - Profile Content

    private func profileContent(_ profile: VoiceProfile) -> some View {
        ScrollView {
            VStack(spacing: 16) {
                statusCard(profile)

                infoCard(profile)

                cloningToggle

                if profile.isReady {
                    voicePublicToggle
                }

                samplesSection

                actionsSection

                if let error = viewModel.error {
                    Text(error)
                        .font(MeeshyFont.relative(13, weight: .medium))
                        .foregroundColor(MeeshyColors.error)
                        .padding(.horizontal, 20)
                }

                Spacer().frame(height: 32)
            }
            .padding(.top, 8)
        }
    }

    // MARK: - Status Card

    private func statusCard(_ profile: VoiceProfile) -> some View {
        HStack(spacing: 12) {
            // Glyphe de statut décoratif : le libellé texte adjacent porte le sens →
            // masqué à VoiceOver (évite l'annonce du nom brut du symbole), scale sous
            // Dynamic Type pour rester harmonisé avec le libellé (146i).
            Image(systemName: statusIcon(for: profile.status))
                .font(MeeshyFont.relative(28))
                .foregroundColor(statusColor(for: profile.status))
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 4) {
                Text(statusLabel(for: profile.status))
                    .font(MeeshyFont.relative(16, weight: .semibold))
                    .foregroundColor(theme.textPrimary)

                Text(statusDescription(for: profile.status))
                    .font(MeeshyFont.relative(12))
                    .foregroundColor(theme.textSecondary)
            }

            Spacer()

            if let quality = profile.quality {
                VStack(spacing: 2) {
                    Text("\(Int(quality * 100))%")
                        .font(MeeshyFont.relative(18, weight: .bold, design: .monospaced))
                        .foregroundColor(Color(hex: accentColor))
                    Text(String(localized: "voice.profile.quality", defaultValue: "Qualite", bundle: .main))
                        .font(MeeshyFont.relative(10, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(theme.backgroundSecondary)
        )
        .padding(.horizontal, 16)
        .accessibilityElement(children: .combine)
    }

    // MARK: - Info Card

    private func infoCard(_ profile: VoiceProfile) -> some View {
        VStack(spacing: 10) {
            infoRow(label: String(localized: "voice.profile.samples", defaultValue: "Echantillons", bundle: .main), value: "\(profile.sampleCount)")
            infoRow(label: String(localized: "voice.profile.totalDuration", defaultValue: "Duree totale", bundle: .main), value: String(localized: "voice.profile.totalDuration.value", defaultValue: "\(profile.totalDurationSeconds) secondes", bundle: .main))
            infoRow(label: String(localized: "voice.profile.createdAt", defaultValue: "Cree le", bundle: .main), value: profile.createdAt.formatted(date: .abbreviated, time: .shortened))
            if let lastUsed = profile.lastUsedAt {
                infoRow(label: String(localized: "voice.profile.lastUsed", defaultValue: "Derniere utilisation", bundle: .main), value: lastUsed.formatted(date: .abbreviated, time: .shortened))
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(theme.backgroundSecondary)
        )
        .padding(.horizontal, 16)
    }

    private func infoRow(label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(MeeshyFont.relative(14))
                .foregroundColor(theme.textSecondary)
            Spacer()
            Text(value)
                .font(MeeshyFont.relative(14, weight: .medium))
                .foregroundColor(theme.textPrimary)
        }
    }

    // MARK: - Cloning Toggle

    private var cloningToggle: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(String(localized: "voice.profile.cloningEnabled", defaultValue: "Clonage vocal actif", bundle: .main))
                    .font(MeeshyFont.relative(15, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                Text(String(localized: "voice.profile.cloningDescription", defaultValue: "Les traductions audio utiliseront votre voix", bundle: .main))
                    .font(MeeshyFont.relative(12))
                    .foregroundColor(theme.textSecondary)
            }
            Spacer()
            Toggle(String(localized: "voice.profile.cloningEnabled", defaultValue: "Clonage vocal actif", bundle: .main), isOn: Binding(
                get: { viewModel.isCloningEnabled },
                set: { newValue in
                    Task { await viewModel.toggleCloning(enabled: newValue) }
                }
            ))
            .labelsHidden()
            .tint(Color(hex: accentColor))
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(theme.backgroundSecondary)
        )
        .padding(.horizontal, 16)
        .accessibilityElement(children: .combine)
    }

    // MARK: - Voice Public Toggle

    private var voicePublicToggle: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(String(localized: "voice.makePublic", defaultValue: "Rendre mon profil vocal public", bundle: .main))
                    .font(MeeshyFont.relative(15, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                Text(String(localized: "voice.makePublic.description", defaultValue: "Un echantillon de votre voix sera visible sur votre profil public", bundle: .main))
                    .font(MeeshyFont.relative(12))
                    .foregroundColor(theme.textSecondary)
            }
            Spacer()
            Toggle(String(localized: "voice.makePublic", defaultValue: "Rendre mon profil vocal public", bundle: .main), isOn: Binding(
                get: { viewModel.isVoicePublic },
                set: { newValue in
                    Task { await viewModel.toggleVoicePublic(enabled: newValue) }
                }
            ))
            .labelsHidden()
            .tint(Color(hex: accentColor))
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(theme.backgroundSecondary)
        )
        .padding(.horizontal, 16)
        .accessibilityElement(children: .combine)
    }

    // MARK: - Samples

    private var samplesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(String(localized: "voice.profile.voiceSamples", defaultValue: "Echantillons vocaux", bundle: .main))
                    .font(MeeshyFont.relative(15, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                Spacer()
                Button {
                    HapticFeedback.light()
                    showAddSamples = true
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "plus")
                            .font(MeeshyFont.relative(12, weight: .semibold))
                        Text(String(localized: "voice.profile.add", defaultValue: "Ajouter", bundle: .main))
                            .font(MeeshyFont.relative(13, weight: .semibold))
                    }
                    .foregroundColor(Color(hex: accentColor))
                }
            }

            if viewModel.samples.isEmpty {
                Text(String(localized: "voice.profile.noSamples", defaultValue: "Aucun echantillon disponible", bundle: .main))
                    .font(MeeshyFont.relative(13))
                    .foregroundColor(theme.textMuted)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
            } else {
                ForEach(viewModel.samples) { sample in
                    sampleRow(sample)
                }
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(theme.backgroundSecondary)
        )
        .padding(.horizontal, 16)
    }

    private func sampleRow(_ sample: VoiceSample) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "waveform")
                .font(MeeshyFont.relative(14))
                .foregroundColor(Color(hex: accentColor))

            Text("\(sample.durationSeconds)s")
                .font(MeeshyFont.relative(13, weight: .medium, design: .monospaced))
                .foregroundColor(theme.textPrimary)

            Text(sample.status)
                .font(MeeshyFont.relative(11, weight: .medium))
                .foregroundColor(theme.textMuted)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Capsule().fill(theme.textMuted.opacity(0.15)))

            Spacer()

            Text(sample.createdAt.formatted(date: .abbreviated, time: .omitted))
                .font(MeeshyFont.relative(11))
                .foregroundColor(theme.textMuted)

            Button {
                HapticFeedback.light()
                Task { await viewModel.deleteSample(id: sample.id) }
            } label: {
                Image(systemName: "trash")
                    .font(MeeshyFont.relative(13))
                    .foregroundColor(MeeshyColors.error.opacity(0.7))
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel(String(localized: "voice.profile.deleteSample", defaultValue: "Supprimer l'échantillon", bundle: .main))
        }
        .padding(.vertical, 6)
    }

    // MARK: - Actions

    private var actionsSection: some View {
        Button(role: .destructive) {
            HapticFeedback.medium()
            showDeleteConfirmation = true
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "trash.fill")
                    .font(MeeshyFont.relative(14))
                Text(String(localized: "voice.profile.deleteProfile", defaultValue: "Supprimer le profil vocal", bundle: .main))
                    .font(MeeshyFont.relative(15, weight: .medium))
            }
            .foregroundColor(MeeshyColors.error)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(MeeshyColors.error.opacity(0.1))
            )
        }
        .padding(.horizontal, 16)
    }

    // MARK: - Add Samples Sheet

    private var addSamplesSheet: some View {
        NavigationView {
            ZStack {
                theme.backgroundGradient.ignoresSafeArea()

                VStack(spacing: 16) {
                    Text(String(localized: "voice.profile.addSamples", defaultValue: "Ajouter des echantillons", bundle: .main))
                        .font(MeeshyFont.relative(20, weight: .bold, design: .rounded))
                        .foregroundColor(theme.textPrimary)
                        .padding(.top, 16)

                    VoiceRecordingView(
                        accentColor: accentColor,
                        minimumSamples: 1,
                        minimumDurationSeconds: 10
                    ) { audioDataList in
                        HapticFeedback.success()
                        Task {
                            await viewModel.uploadAdditionalSamples(audioDataList)
                            showAddSamples = false
                        }
                    }
                }
                .padding(.horizontal, 16)
            }
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(String(localized: "common.close", defaultValue: "Fermer", bundle: .main)) { showAddSamples = false }
                }
            }
        }
    }

    // MARK: - Status Helpers

    private func statusIcon(for status: VoiceProfileStatus) -> String {
        switch status {
        case .pending: return "clock.fill"
        case .processing: return "gearshape.2.fill"
        case .ready: return "checkmark.seal.fill"
        case .failed: return "exclamationmark.triangle.fill"
        case .expired: return "clock.badge.exclamationmark.fill"
        }
    }

    private func statusColor(for status: VoiceProfileStatus) -> Color {
        switch status {
        case .pending: return MeeshyColors.warning
        case .processing: return MeeshyColors.info
        case .ready: return MeeshyColors.success
        case .failed: return MeeshyColors.error
        case .expired: return theme.textMuted
        }
    }

    private func statusLabel(for status: VoiceProfileStatus) -> String {
        switch status {
        case .pending: return String(localized: "voice.profile.status.pending.label", defaultValue: "En attente", bundle: .main)
        case .processing: return String(localized: "voice.profile.status.processing.label", defaultValue: "Analyse en cours", bundle: .main)
        case .ready: return String(localized: "voice.profile.status.ready.label", defaultValue: "Actif", bundle: .main)
        case .failed: return String(localized: "voice.profile.status.failed.label", defaultValue: "Echec", bundle: .main)
        case .expired: return String(localized: "voice.profile.status.expired.label", defaultValue: "Expire", bundle: .main)
        }
    }

    private func statusDescription(for status: VoiceProfileStatus) -> String {
        switch status {
        case .pending: return String(localized: "voice.profile.status.pending.description", defaultValue: "Votre profil est en file d'attente", bundle: .main)
        case .processing: return String(localized: "voice.profile.status.processing.description", defaultValue: "L'IA analyse vos echantillons vocaux", bundle: .main)
        case .ready: return String(localized: "voice.profile.status.ready.description", defaultValue: "Votre profil vocal est pret a l'emploi", bundle: .main)
        case .failed: return String(localized: "voice.profile.status.failed.description", defaultValue: "L'analyse a echoue, veuillez reessayer", bundle: .main)
        case .expired: return String(localized: "voice.profile.status.expired.description", defaultValue: "Veuillez enregistrer de nouveaux echantillons", bundle: .main)
        }
    }
}
