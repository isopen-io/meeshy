import SwiftUI
import MeeshySDK
import MeeshyUI

struct VoiceProfileManageView: View {
    let accentColor: String

    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared
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
        .alert("Supprimer le profil vocal", isPresented: $showDeleteConfirmation) {
            Button("Annuler", role: .cancel) {}
            Button("Supprimer", role: .destructive) {
                Task { await viewModel.deleteProfile() }
            }
        } message: {
            Text("Cette action est irreversible. Toutes vos donnees vocales seront supprimees conformement au RGPD.")
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
            Text("Profil vocal")
                .font(.system(size: 20, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)
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

            Image(systemName: "person.wave.2.fill")
                .font(.system(size: 64))
                .foregroundStyle(
                    LinearGradient(
                        colors: [Color(hex: accentColor), Color(hex: accentColor).opacity(0.7)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            Text("Aucun profil vocal")
                .font(.system(size: 22, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            Text("Creez un profil vocal pour que vos messages traduits conservent votre voix naturelle.")
                .font(.system(size: 15))
                .multilineTextAlignment(.center)
                .foregroundColor(theme.textSecondary)
                .padding(.horizontal, 32)

            Button {
                HapticFeedback.medium()
                showWizard = true
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "plus.circle.fill")
                        .font(.system(size: 16))
                    Text("Creer un profil vocal")
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

                samplesSection

                actionsSection

                if let error = viewModel.error {
                    Text(error)
                        .font(.system(size: 13, weight: .medium))
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
            Image(systemName: statusIcon(for: profile.status))
                .font(.system(size: 28))
                .foregroundColor(statusColor(for: profile.status))

            VStack(alignment: .leading, spacing: 4) {
                Text(statusLabel(for: profile.status))
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(theme.textPrimary)

                Text(statusDescription(for: profile.status))
                    .font(.system(size: 12))
                    .foregroundColor(theme.textSecondary)
            }

            Spacer()

            if let quality = profile.quality {
                VStack(spacing: 2) {
                    Text("\(Int(quality * 100))%")
                        .font(.system(size: 18, weight: .bold, design: .monospaced))
                        .foregroundColor(Color(hex: accentColor))
                    Text("Qualite")
                        .font(.system(size: 10, weight: .medium))
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
    }

    // MARK: - Info Card

    private func infoCard(_ profile: VoiceProfile) -> some View {
        VStack(spacing: 10) {
            infoRow(label: "Echantillons", value: "\(profile.sampleCount)")
            infoRow(label: "Duree totale", value: "\(profile.totalDurationSeconds) secondes")
            infoRow(label: "Cree le", value: profile.createdAt.formatted(date: .abbreviated, time: .shortened))
            if let lastUsed = profile.lastUsedAt {
                infoRow(label: "Derniere utilisation", value: lastUsed.formatted(date: .abbreviated, time: .shortened))
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
                .font(.system(size: 14))
                .foregroundColor(theme.textSecondary)
            Spacer()
            Text(value)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(theme.textPrimary)
        }
    }

    // MARK: - Cloning Toggle

    private var cloningToggle: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("Clonage vocal actif")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                Text("Les traductions audio utiliseront votre voix")
                    .font(.system(size: 12))
                    .foregroundColor(theme.textSecondary)
            }
            Spacer()
            Toggle("", isOn: Binding(
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
    }

    // MARK: - Samples

    private var samplesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Echantillons vocaux")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                Spacer()
                Button {
                    HapticFeedback.light()
                    showAddSamples = true
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "plus")
                            .font(.system(size: 12, weight: .semibold))
                        Text("Ajouter")
                            .font(.system(size: 13, weight: .semibold))
                    }
                    .foregroundColor(Color(hex: accentColor))
                }
            }

            if viewModel.samples.isEmpty {
                Text("Aucun echantillon disponible")
                    .font(.system(size: 13))
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
                .font(.system(size: 14))
                .foregroundColor(Color(hex: accentColor))

            Text("\(sample.durationSeconds)s")
                .font(.system(size: 13, weight: .medium, design: .monospaced))
                .foregroundColor(theme.textPrimary)

            Text(sample.status)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(theme.textMuted)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Capsule().fill(theme.textMuted.opacity(0.15)))

            Spacer()

            Text(sample.createdAt.formatted(date: .abbreviated, time: .omitted))
                .font(.system(size: 11))
                .foregroundColor(theme.textMuted)

            Button {
                HapticFeedback.light()
                Task { await viewModel.deleteSample(id: sample.id) }
            } label: {
                Image(systemName: "trash")
                    .font(.system(size: 13))
                    .foregroundColor(MeeshyColors.error.opacity(0.7))
            }
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
                    .font(.system(size: 14))
                Text("Supprimer le profil vocal")
                    .font(.system(size: 15, weight: .medium))
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
                    Text("Ajouter des echantillons")
                        .font(.system(size: 20, weight: .bold, design: .rounded))
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
                    Button("Fermer") { showAddSamples = false }
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
        case .pending: return "En attente"
        case .processing: return "Analyse en cours"
        case .ready: return "Actif"
        case .failed: return "Echec"
        case .expired: return "Expire"
        }
    }

    private func statusDescription(for status: VoiceProfileStatus) -> String {
        switch status {
        case .pending: return "Votre profil est en file d'attente"
        case .processing: return "L'IA analyse vos echantillons vocaux"
        case .ready: return "Votre profil vocal est pret a l'emploi"
        case .failed: return "L'analyse a echoue, veuillez reessayer"
        case .expired: return "Veuillez enregistrer de nouveaux echantillons"
        }
    }
}
