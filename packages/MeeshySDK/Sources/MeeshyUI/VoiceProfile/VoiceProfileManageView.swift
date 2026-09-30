import SwiftUI
import Combine
import MeeshySDK

public struct VoiceProfileManageView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel = VoiceProfileManageViewModel()
    let accentColor: String

    public init(accentColor: String = MeeshyColors.brandPrimaryHex) {
        self.accentColor = accentColor
    }

    public var body: some View {
        NavigationStack {
            ZStack {
                Color(.systemGroupedBackground).ignoresSafeArea()

                ScrollView {
                    VStack(spacing: MeeshySpacing.xl) {
                        profileStatusCard
                        cloningToggle
                        samplesSection
                        gdprSection
                    }
                    .padding(.horizontal, MeeshySpacing.lg)
                    .padding(.top, MeeshySpacing.md)
                }
            }
            .navigationTitle(String(localized: "voiceProfile.manage.title", defaultValue: "Profil vocal", bundle: .module))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(String(localized: "voiceProfile.manage.close", defaultValue: "Fermer", bundle: .module)) { dismiss() }
                        .foregroundColor(Color(hex: accentColor))
                }
            }
            .task { await viewModel.loadProfile() }
            .alert(String(localized: "voiceProfile.manage.deleteTitle", defaultValue: "Supprimer le profil vocal ?", bundle: .module), isPresented: $viewModel.showDeleteConfirmation) {
                Button(String(localized: "voiceProfile.manage.cancelDelete", defaultValue: "Annuler", bundle: .module), role: .cancel) {}
                Button(String(localized: "voiceProfile.manage.deleteAll", defaultValue: "Supprimer tout", bundle: .module), role: .destructive) {
                    Task { await viewModel.deleteProfile() }
                }
            } message: {
                Text(String(localized: "voiceProfile.manage.deleteMessage", defaultValue: "Cette action supprimera definitivement votre profil vocal, tous vos echantillons et revoquera votre consentement. Cette action est irreversible (RGPD).", bundle: .module))
            }
        }
    }

    // MARK: - Profile Status Card

    private var profileStatusCard: some View {
        VStack(spacing: MeeshySpacing.md) {
            HStack(spacing: MeeshySpacing.md) {
                Image(systemName: viewModel.profile?.isReady == true ? "waveform.circle.fill" : "waveform.circle")
                    .font(.system(size: 36))
                    .foregroundColor(viewModel.profile?.isReady == true ? MeeshyColors.success : Color(hex: accentColor))

                VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                    Text(statusTitle)
                        .font(.system(size: MeeshyFont.calloutSize, weight: .bold))
                        .foregroundColor(.primary)

                    Text(statusSubtitle)
                        .font(.system(size: MeeshyFont.smallSize))
                        .foregroundColor(.secondary)
                }

                Spacer()
            }

            if let profile = viewModel.profile {
                HStack(spacing: MeeshySpacing.lg) {
                    statItem(label: String(localized: "voiceProfile.manage.samples", defaultValue: "Echantillons", bundle: .module), value: "\(profile.sampleCount)")
                    statItem(label: String(localized: "voiceProfile.manage.totalDuration", defaultValue: "Duree totale", bundle: .module), value: "\(profile.totalDurationSeconds)s")
                    if let quality = profile.quality {
                        statItem(label: String(localized: "voiceProfile.manage.quality", defaultValue: "Qualite", bundle: .module), value: "\(Int(quality * 100))%")
                    }
                }
            }
        }
        .padding(MeeshySpacing.lg)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                .fill(Color(.secondarySystemGroupedBackground))
        )
    }

    private func statItem(label: String, value: String) -> some View {
        VStack(spacing: MeeshySpacing.xxs) {
            Text(value)
                .font(.system(size: MeeshyFont.calloutSize, weight: .bold))
                .foregroundColor(Color(hex: accentColor))
            Text(label)
                .font(.system(size: MeeshyFont.captionSize, weight: .medium))
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
    }

    private var statusTitle: String {
        guard let profile = viewModel.profile else { return String(localized: "voiceProfile.status.noProfile", defaultValue: "Aucun profil", bundle: .module) }
        switch profile.status {
        case .ready: return String(localized: "voiceProfile.status.active", defaultValue: "Profil actif", bundle: .module)
        case .processing: return String(localized: "voiceProfile.status.processing", defaultValue: "En traitement...", bundle: .module)
        case .pending: return String(localized: "voiceProfile.status.pending", defaultValue: "En attente", bundle: .module)
        case .failed: return String(localized: "voiceProfile.status.failed", defaultValue: "Erreur", bundle: .module)
        case .expired: return String(localized: "voiceProfile.status.expired", defaultValue: "Expire", bundle: .module)
        }
    }

    private var statusSubtitle: String {
        guard let profile = viewModel.profile else { return String(localized: "voiceProfile.subtitle.noProfile", defaultValue: "Creez un profil vocal pour activer le clonage", bundle: .module) }
        switch profile.status {
        case .ready: return String(localized: "voiceProfile.subtitle.active", defaultValue: "Votre voix est utilisee pour les traductions audio", bundle: .module)
        case .processing: return String(localized: "voiceProfile.subtitle.processing", defaultValue: "Vos echantillons sont en cours de traitement", bundle: .module)
        case .pending: return String(localized: "voiceProfile.subtitle.pending", defaultValue: "En attente de traitement", bundle: .module)
        case .failed: return String(localized: "voiceProfile.subtitle.failed", defaultValue: "Le traitement a echoue, reessayez", bundle: .module)
        case .expired: return String(localized: "voiceProfile.subtitle.expired", defaultValue: "Enregistrez de nouveaux echantillons", bundle: .module)
        }
    }

    // MARK: - Cloning Toggle

    private var cloningToggle: some View {
        HStack(spacing: MeeshySpacing.md) {
            Image(systemName: "waveform.and.mic")
                .font(.system(size: MeeshyIconSize.md, weight: .medium))
                .foregroundColor(Color(hex: accentColor))
                .frame(width: 28, height: 28)
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.xs)
                        .fill(Color(hex: accentColor).opacity(0.12))
                )

            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(String(localized: "voiceProfile.manage.cloningActive", defaultValue: "Clonage vocal actif", bundle: .module))
                    .font(.system(size: MeeshyFont.labelSize, weight: .medium))
                    .foregroundColor(.primary)
                Text(String(localized: "voiceProfile.manage.cloningSubtitle", defaultValue: "Utiliser votre voix pour les traductions", bundle: .module))
                    .font(.system(size: MeeshyFont.footnoteSize))
                    .foregroundColor(.secondary)
            }

            Spacer()

            Toggle("", isOn: $viewModel.cloningEnabled)
                .labelsHidden()
                .tint(Color(hex: accentColor))
                .adaptiveOnChange(of: viewModel.cloningEnabled) { _, newValue in
                    Task { await viewModel.toggleCloning(enabled: newValue) }
                }
        }
        .padding(MeeshySpacing.mdPlus)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                .fill(Color(.secondarySystemGroupedBackground))
        )
    }

    // MARK: - Samples Section

    private var samplesSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            HStack(spacing: MeeshySpacing.xsPlus) {
                Image(systemName: "waveform")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(Color(hex: accentColor))
                Text(String(localized: "voiceProfile.manage.samplesHeader", defaultValue: "ECHANTILLONS VOCAUX", bundle: .module))
                    .font(.system(size: MeeshyFont.footnoteSize, weight: .bold, design: .rounded))
                    .foregroundColor(Color(hex: accentColor))
                    .tracking(1.0)
            }

            if viewModel.samples.isEmpty {
                Text(String(localized: "voiceProfile.manage.noSamples", defaultValue: "Aucun echantillon enregistre", bundle: .module))
                    .font(.system(size: MeeshyFont.subheadSize))
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, MeeshySpacing.xl)
            } else {
                ForEach(viewModel.samples) { sample in
                    HStack(spacing: MeeshySpacing.smPlus) {
                        Image(systemName: "waveform")
                            .font(.system(size: 13))
                            .foregroundColor(Color(hex: accentColor))

                        Text(String(localized: "voiceProfile.manage.sample", defaultValue: "Echantillon", bundle: .module))
                            .font(.system(size: MeeshyFont.subheadSize, weight: .medium))
                            .foregroundColor(.primary)

                        Spacer()

                        Text("\(sample.durationSeconds)s")
                            .font(.system(size: MeeshyFont.smallSize, weight: .medium, design: .monospaced))
                            .foregroundColor(.secondary)

                        Button {
                            Task { await viewModel.deleteSample(sampleId: sample.id) }
                        } label: {
                            Image(systemName: "trash")
                                .font(.system(size: MeeshyIconSize.xs))
                                .foregroundColor(MeeshyColors.tileCoral)
                        }
                    }
                    .padding(.horizontal, MeeshySpacing.mdPlus)
                    .padding(.vertical, MeeshySpacing.smPlus)
                    .background(
                        RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                            .fill(Color(.secondarySystemGroupedBackground))
                    )
                }
            }
        }
    }

    // MARK: - GDPR Section

    private var gdprSection: some View {
        VStack(spacing: MeeshySpacing.sm) {
            Button {
                viewModel.showDeleteConfirmation = true
            } label: {
                HStack {
                    Image(systemName: "trash.fill")
                        .font(.system(size: MeeshyIconSize.sm, weight: .semibold))
                    Text(String(localized: "voiceProfile.manage.deleteAllData", defaultValue: "Supprimer toutes les donnees vocales", bundle: .module))
                        .font(.system(size: MeeshyFont.labelSize, weight: .semibold))
                }
                .foregroundColor(MeeshyColors.errorStrong)
                .frame(maxWidth: .infinity)
                .padding(.vertical, MeeshySpacing.mdPlus)
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.md)
                        .fill(MeeshyColors.errorStrong.opacity(0.1))
                        .overlay(
                            RoundedRectangle(cornerRadius: MeeshyRadius.md)
                                .stroke(MeeshyColors.errorStrong.opacity(0.3), lineWidth: 1)
                        )
                )
            }

            Text(String(localized: "voiceProfile.manage.gdprNotice", defaultValue: "Conforme au RGPD - Vos donnees vocales seront definitivement supprimees de nos serveurs.", bundle: .module))
                .font(.system(size: MeeshyFont.captionSize))
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
    }
}

// MARK: - Manage ViewModel

@MainActor
class VoiceProfileManageViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    @Published var profile: VoiceProfile?
    @Published var samples: [VoiceSample] = []
    @Published var cloningEnabled = false
    @Published var showDeleteConfirmation = false
    @Published var isLoading = false

    private let service = VoiceProfileService.shared

    func loadProfile() async {
        isLoading = true
        do {
            profile = try await service.getProfile()
            samples = try await service.getSamples()
            cloningEnabled = profile?.isReady == true
        } catch {
            // Silently handle - profile may not exist yet
        }
        isLoading = false
    }

    func toggleCloning(enabled: Bool) async {
        do {
            try await service.toggleVoiceCloning(enabled: enabled)
        } catch {
            cloningEnabled = !enabled
        }
    }

    func deleteSample(sampleId: String) async {
        do {
            try await service.deleteSample(sampleId: sampleId)
            samples.removeAll { $0.id == sampleId }
        } catch {
            // Handle error
        }
    }

    func deleteProfile() async {
        do {
            try await service.deleteProfile()
            profile = nil
            samples = []
            cloningEnabled = false
        } catch {
            // Handle error
        }
    }
}
