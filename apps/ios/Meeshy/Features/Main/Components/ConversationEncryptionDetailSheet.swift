import SwiftUI
import os
import MeeshySDK

struct ConversationEncryptionDetailSheet: View {
    let conversationId: String
    let accentColor: String

    @Environment(\.dismiss) private var dismiss
    @State private var status: E2EAPI.ConversationEncryptionStatus?
    @State private var isLoading = true
    @State private var isEnabling = false
    @State private var selectedMode: E2EAPI.ConversationEncryptionMode = .server
    @State private var errorMessage: String?

    private static let logger = Logger(subsystem: "me.meeshy.app", category: "conversation-encryption")

    var body: some View {
        NavigationStack {
            Form {
                if isLoading {
                    Section {
                        HStack {
                            ProgressView()
                                .controlSize(.small)
                            Text("Chargement du statut…")
                                .foregroundColor(.secondary)
                        }
                    }
                } else if let status, status.isEncrypted, let mode = status.mode {
                    activeStateSections(mode: mode, status: status)
                } else {
                    enableStateSections
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundColor(.red)
                            .font(.caption)
                    }
                }
            }
            .navigationTitle("Chiffrement")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Fermer") { dismiss() }
                }
            }
            .task { await loadStatus() }
        }
    }

    // MARK: - Active state

    @ViewBuilder
    private func activeStateSections(mode: E2EAPI.ConversationEncryptionMode, status: E2EAPI.ConversationEncryptionStatus) -> some View {
        Section {
            HStack(spacing: 12) {
                Image(systemName: "lock.shield.fill")
                    .font(.title2)
                    .foregroundColor(.green)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Chiffrement actif")
                        .font(.headline)
                    Text(modeLabel(mode))
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
            }
            .padding(.vertical, 4)
        }

        Section {
            LabeledContent("Mode", value: modeLabel(mode))
            if let enabledAt = status.enabledAt {
                LabeledContent("Activé le", value: enabledAt.formatted(date: .abbreviated, time: .shortened))
            }
            LabeledContent("Traduction", value: status.canTranslate ? "Disponible" : "Désactivée")
        } header: {
            Text("Détails")
        }

        Section {
            // Disabled toggle — backend enforces immutability
            HStack {
                Image(systemName: "lock.fill")
                    .foregroundColor(.secondary)
                Text("Chiffrement activé")
                Spacer()
                Toggle("", isOn: .constant(true))
                    .disabled(true)
                    .labelsHidden()
            }
        } footer: {
            Text("Une fois activé, le chiffrement ne peut plus être désactivé pour cette conversation. C'est une protection contre les régressions de sécurité.")
                .font(.caption)
        }
    }

    // MARK: - Enable state

    @ViewBuilder
    private var enableStateSections: some View {
        Section {
            HStack(spacing: 12) {
                Image(systemName: "lock.open")
                    .font(.title2)
                    .foregroundColor(.orange)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Conversation non chiffrée")
                        .font(.headline)
                    Text("Les messages sont stockés en clair côté serveur.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            .padding(.vertical, 4)
        }

        Section {
            Picker("Mode", selection: $selectedMode) {
                ForEach(E2EAPI.ConversationEncryptionMode.allCases, id: \.self) { mode in
                    VStack(alignment: .leading) {
                        Text(modeLabel(mode))
                            .font(.subheadline.weight(.semibold))
                        Text(modeDescription(mode))
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    .tag(mode)
                }
            }
            .pickerStyle(.inline)
            .disabled(isEnabling)
        } header: {
            Text("Mode")
        } footer: {
            Text("L'activation est irréversible. Choisissez le mode adapté à vos besoins de traduction et de confidentialité.")
                .font(.caption)
        }

        Section {
            Button {
                Task { await activate() }
            } label: {
                HStack {
                    Spacer()
                    if isEnabling {
                        ProgressView().tint(.white)
                    } else {
                        Image(systemName: "lock.fill")
                        Text("Activer le chiffrement").fontWeight(.semibold)
                    }
                    Spacer()
                }
            }
            .listRowBackground(Color(hex: accentColor))
            .foregroundColor(.white)
            .disabled(isEnabling)
        }
    }

    // MARK: - Helpers

    private func modeLabel(_ mode: E2EAPI.ConversationEncryptionMode) -> String {
        switch mode {
        case .e2ee:   return "End-to-End (Signal)"
        case .server: return "Serveur (AES-256-GCM)"
        case .hybrid: return "Hybride (E2EE + Serveur)"
        }
    }

    private func modeDescription(_ mode: E2EAPI.ConversationEncryptionMode) -> String {
        switch mode {
        case .e2ee:   return "Confidentialité maximale. La traduction automatique n'est pas possible."
        case .server: return "Serveur protégé. La traduction reste disponible (recommandé)."
        case .hybrid: return "Double couche. Plus lent, traduction conservée."
        }
    }

    private func loadStatus() async {
        isLoading = true
        defer { isLoading = false }
        do {
            status = try await E2EAPI.shared.fetchEncryptionStatus(conversationId: conversationId)
        } catch {
            Self.logger.error("loadStatus failed: \(error.localizedDescription)")
            errorMessage = "Impossible de lire le statut: \(error.localizedDescription)"
        }
    }

    private func activate() async {
        isEnabling = true
        errorMessage = nil
        defer { isEnabling = false }
        do {
            let result = try await E2EAPI.shared.enableEncryption(
                conversationId: conversationId,
                mode: selectedMode
            )
            status = E2EAPI.ConversationEncryptionStatus(
                isEncrypted: true,
                mode: result.mode,
                enabledAt: result.enabledAt,
                enabledBy: result.enabledBy,
                canTranslate: result.mode != .e2ee
            )
            HapticFeedback.success()
        } catch {
            errorMessage = error.localizedDescription
            HapticFeedback.error()
        }
    }
}
