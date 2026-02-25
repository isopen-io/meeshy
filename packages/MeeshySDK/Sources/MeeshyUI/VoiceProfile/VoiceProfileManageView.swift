import SwiftUI
import MeeshySDK

public struct VoiceProfileManageView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel = VoiceProfileManageViewModel()
    let accentColor: String

    public init(accentColor: String = "A855F7") {
        self.accentColor = accentColor
    }

    public var body: some View {
        NavigationView {
            ZStack {
                Color(.systemGroupedBackground).ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 20) {
                        profileStatusCard
                        cloningToggle
                        samplesSection
                        gdprSection
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                }
            }
            .navigationTitle("Profil vocal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Fermer") { dismiss() }
                        .foregroundColor(Color(hex: accentColor))
                }
            }
            .task { await viewModel.loadProfile() }
            .alert("Supprimer le profil vocal ?", isPresented: $viewModel.showDeleteConfirmation) {
                Button("Annuler", role: .cancel) {}
                Button("Supprimer tout", role: .destructive) {
                    Task { await viewModel.deleteProfile() }
                }
            } message: {
                Text("Cette action supprimera definitivement votre profil vocal, tous vos echantillons et revoquera votre consentement. Cette action est irreversible (RGPD).")
            }
        }
    }

    // MARK: - Profile Status Card

    private var profileStatusCard: some View {
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                Image(systemName: viewModel.profile?.isReady == true ? "waveform.circle.fill" : "waveform.circle")
                    .font(.system(size: 36))
                    .foregroundColor(Color(hex: viewModel.profile?.isReady == true ? "2ECC71" : accentColor))

                VStack(alignment: .leading, spacing: 4) {
                    Text(statusTitle)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.primary)

                    Text(statusSubtitle)
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                }

                Spacer()
            }

            if let profile = viewModel.profile {
                HStack(spacing: 16) {
                    statItem(label: "Echantillons", value: "\(profile.sampleCount)")
                    statItem(label: "Duree totale", value: "\(profile.totalDurationSeconds)s")
                    if let quality = profile.quality {
                        statItem(label: "Qualite", value: "\(Int(quality * 100))%")
                    }
                }
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(.secondarySystemGroupedBackground))
        )
    }

    private func statItem(label: String, value: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(Color(hex: accentColor))
            Text(label)
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
    }

    private var statusTitle: String {
        guard let profile = viewModel.profile else { return "Aucun profil" }
        switch profile.status {
        case .ready: return "Profil actif"
        case .processing: return "En traitement..."
        case .pending: return "En attente"
        case .failed: return "Erreur"
        case .expired: return "Expire"
        }
    }

    private var statusSubtitle: String {
        guard let profile = viewModel.profile else { return "Creez un profil vocal pour activer le clonage" }
        switch profile.status {
        case .ready: return "Votre voix est utilisee pour les traductions audio"
        case .processing: return "Vos echantillons sont en cours de traitement"
        case .pending: return "En attente de traitement"
        case .failed: return "Le traitement a echoue, reessayez"
        case .expired: return "Enregistrez de nouveaux echantillons"
        }
    }

    // MARK: - Cloning Toggle

    private var cloningToggle: some View {
        HStack(spacing: 12) {
            Image(systemName: "waveform.and.mic")
                .font(.system(size: 16, weight: .medium))
                .foregroundColor(Color(hex: accentColor))
                .frame(width: 28, height: 28)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color(hex: accentColor).opacity(0.12))
                )

            VStack(alignment: .leading, spacing: 2) {
                Text("Clonage vocal actif")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.primary)
                Text("Utiliser votre voix pour les traductions")
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
            }

            Spacer()

            Toggle("", isOn: $viewModel.cloningEnabled)
                .labelsHidden()
                .tint(Color(hex: accentColor))
                .onChange(of: viewModel.cloningEnabled) { newValue in
                    Task { await viewModel.toggleCloning(enabled: newValue) }
                }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(.secondarySystemGroupedBackground))
        )
    }

    // MARK: - Samples Section

    private var samplesSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "waveform")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(Color(hex: accentColor))
                Text("ECHANTILLONS VOCAUX")
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .foregroundColor(Color(hex: accentColor))
                    .tracking(1.0)
            }

            if viewModel.samples.isEmpty {
                Text("Aucun echantillon enregistre")
                    .font(.system(size: 13))
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 20)
            } else {
                ForEach(viewModel.samples) { sample in
                    HStack(spacing: 10) {
                        Image(systemName: "waveform")
                            .font(.system(size: 13))
                            .foregroundColor(Color(hex: accentColor))

                        Text("Echantillon")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(.primary)

                        Spacer()

                        Text("\(sample.durationSeconds)s")
                            .font(.system(size: 12, weight: .medium, design: .monospaced))
                            .foregroundColor(.secondary)

                        Button {
                            Task { await viewModel.deleteSample(sampleId: sample.id) }
                        } label: {
                            Image(systemName: "trash")
                                .font(.system(size: 12))
                                .foregroundColor(Color(hex: "FF6B6B"))
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(Color(.secondarySystemGroupedBackground))
                    )
                }
            }
        }
    }

    // MARK: - GDPR Section

    private var gdprSection: some View {
        VStack(spacing: 8) {
            Button {
                viewModel.showDeleteConfirmation = true
            } label: {
                HStack {
                    Image(systemName: "trash.fill")
                        .font(.system(size: 14, weight: .semibold))
                    Text("Supprimer toutes les donnees vocales")
                        .font(.system(size: 14, weight: .semibold))
                }
                .foregroundColor(Color(hex: "EF4444"))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(
                    RoundedRectangle(cornerRadius: 14)
                        .fill(Color(hex: "EF4444").opacity(0.1))
                        .overlay(
                            RoundedRectangle(cornerRadius: 14)
                                .stroke(Color(hex: "EF4444").opacity(0.3), lineWidth: 1)
                        )
                )
            }

            Text("Conforme au RGPD - Vos donnees vocales seront definitivement supprimees de nos serveurs.")
                .font(.system(size: 10))
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
    }
}

// MARK: - Manage ViewModel

@MainActor
class VoiceProfileManageViewModel: ObservableObject {
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
