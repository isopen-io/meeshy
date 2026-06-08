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
                            Text(String(localized: "conversation.encryption.detail.loading",
                                        defaultValue: "Chargement du statut…",
                                        bundle: .main))
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
                            .foregroundColor(MeeshyColors.error)
                            .font(.caption)
                    }
                }
            }
            .navigationTitle(String(localized: "conversation.encryption.detail.title",
                                    defaultValue: "Chiffrement",
                                    bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.close",
                                  defaultValue: "Fermer",
                                  bundle: .main)) { dismiss() }
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
                    .foregroundColor(MeeshyColors.success)
                VStack(alignment: .leading, spacing: 4) {
                    Text(String(localized: "conversation.encryption.detail.activeLabel",
                                defaultValue: "Chiffrement actif",
                                bundle: .main))
                        .font(.headline)
                    Text(modeLabel(mode))
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
            }
            .padding(.vertical, 4)
        }

        Section {
            LabeledContent(String(localized: "conversation.encryption.detail.modeLabel",
                                  defaultValue: "Mode",
                                  bundle: .main),
                           value: modeLabel(mode))
            if let enabledAt = status.enabledAt {
                LabeledContent(String(localized: "conversation.encryption.detail.enabledOn",
                                      defaultValue: "Activé le",
                                      bundle: .main),
                               value: enabledAt.formatted(date: .abbreviated, time: .shortened))
            }
            LabeledContent(String(localized: "conversation.encryption.detail.translation",
                                  defaultValue: "Traduction",
                                  bundle: .main),
                           value: status.canTranslate
                                ? String(localized: "conversation.encryption.detail.translation.available",
                                         defaultValue: "Disponible",
                                         bundle: .main)
                                : String(localized: "conversation.encryption.detail.translation.disabled",
                                         defaultValue: "Désactivée",
                                         bundle: .main))
        } header: {
            Text(String(localized: "conversation.encryption.detail.detailsHeader",
                        defaultValue: "Détails",
                        bundle: .main))
        }

        Section {
            // Disabled toggle — backend enforces immutability
            HStack {
                Image(systemName: "lock.fill")
                    .foregroundColor(.secondary)
                Text(String(localized: "conversation.encryption.detail.toggleEnabled",
                            defaultValue: "Chiffrement activé",
                            bundle: .main))
                Spacer()
                Toggle("", isOn: .constant(true))
                    .disabled(true)
                    .labelsHidden()
            }
        } footer: {
            Text(String(localized: "conversation.encryption.detail.immutabilityFooter",
                        defaultValue: "Une fois activé, le chiffrement ne peut plus être désactivé pour cette conversation. C'est une protection contre les régressions de sécurité.",
                        bundle: .main))
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
                    .foregroundColor(MeeshyColors.warning)
                VStack(alignment: .leading, spacing: 4) {
                    Text(String(localized: "conversation.encryption.detail.inactiveLabel",
                                defaultValue: "Conversation non chiffrée",
                                bundle: .main))
                        .font(.headline)
                    Text(String(localized: "conversation.encryption.detail.inactiveSubtitle",
                                defaultValue: "Les messages sont stockés en clair côté serveur.",
                                bundle: .main))
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            .padding(.vertical, 4)
        }

        Section {
            Picker(String(localized: "conversation.encryption.detail.modeLabel",
                          defaultValue: "Mode",
                          bundle: .main),
                   selection: $selectedMode) {
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
            Text(String(localized: "conversation.encryption.detail.modeHeader",
                        defaultValue: "Mode",
                        bundle: .main))
        } footer: {
            Text(String(localized: "conversation.encryption.detail.activationFooter",
                        defaultValue: "L'activation est irréversible. Choisissez le mode adapté à vos besoins de traduction et de confidentialité.",
                        bundle: .main))
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
                        Text(String(localized: "conversation.encryption.detail.activate",
                                    defaultValue: "Activer le chiffrement",
                                    bundle: .main)).fontWeight(.semibold)
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
        case .e2ee:
            return String(localized: "conversation.encryption.mode.e2ee.label",
                          defaultValue: "End-to-End (Signal)",
                          bundle: .main)
        case .server:
            return String(localized: "conversation.encryption.mode.server.label",
                          defaultValue: "Serveur (AES-256-GCM)",
                          bundle: .main)
        case .hybrid:
            return String(localized: "conversation.encryption.mode.hybrid.label",
                          defaultValue: "Hybride (E2EE + Serveur)",
                          bundle: .main)
        }
    }

    private func modeDescription(_ mode: E2EAPI.ConversationEncryptionMode) -> String {
        switch mode {
        case .e2ee:
            return String(localized: "conversation.encryption.mode.e2ee.description",
                          defaultValue: "Confidentialité maximale. La traduction automatique n'est pas possible.",
                          bundle: .main)
        case .server:
            return String(localized: "conversation.encryption.mode.server.description",
                          defaultValue: "Serveur protégé. La traduction reste disponible (recommandé).",
                          bundle: .main)
        case .hybrid:
            return String(localized: "conversation.encryption.mode.hybrid.description",
                          defaultValue: "Double couche. Plus lent, traduction conservée.",
                          bundle: .main)
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
