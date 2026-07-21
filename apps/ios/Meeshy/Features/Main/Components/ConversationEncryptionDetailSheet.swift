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
                                        defaultValue: "Loading status…",
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
                                    defaultValue: "Encryption",
                                    bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.close",
                                  defaultValue: "Close",
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
                                defaultValue: "Active encryption",
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
                                      defaultValue: "Activated on",
                                      bundle: .main),
                               value: enabledAt.formatted(date: .abbreviated, time: .shortened))
            }
            LabeledContent(String(localized: "conversation.encryption.detail.translation",
                                  defaultValue: "Translation",
                                  bundle: .main),
                           value: status.canTranslate
                                ? String(localized: "conversation.encryption.detail.translation.available",
                                         defaultValue: "Available",
                                         bundle: .main)
                                : String(localized: "conversation.encryption.detail.translation.disabled",
                                         defaultValue: "Disabled",
                                         bundle: .main))
        } header: {
            Text(String(localized: "conversation.encryption.detail.detailsHeader",
                        defaultValue: "Details",
                        bundle: .main))
        }

        Section {
            // Disabled toggle — backend enforces immutability. The switch is a
            // read-only status indicator, redundant with the adjacent label, so
            // the whole row is exposed to VoiceOver as one element (the empty,
            // `.labelsHidden()` toggle would otherwise read as an unlabeled
            // "dimmed switch" with no context).
            HStack {
                Image(systemName: "lock.fill")
                    .foregroundColor(.secondary)
                    .accessibilityHidden(true)
                Text(String(localized: "conversation.encryption.detail.toggleEnabled",
                            defaultValue: "Encryption enabled",
                            bundle: .main))
                Spacer()
                Toggle("", isOn: .constant(true))
                    .disabled(true)
                    .labelsHidden()
            }
            .accessibilityElement(children: .combine)
        } footer: {
            Text(String(localized: "conversation.encryption.detail.immutabilityFooter",
                        defaultValue: "Once enabled, encryption cannot be disabled for this conversation. This protects against security regressions.",
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
                                defaultValue: "Unencrypted conversation",
                                bundle: .main))
                        .font(.headline)
                    Text(String(localized: "conversation.encryption.detail.inactiveSubtitle",
                                defaultValue: "Messages are stored in plaintext on the server.",
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
                        defaultValue: "Activation is irreversible. Choose the mode that fits your translation and privacy needs.",
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
                                    defaultValue: "Enable encryption",
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
                          defaultValue: "Server (AES-256-GCM)",
                          bundle: .main)
        case .hybrid:
            return String(localized: "conversation.encryption.mode.hybrid.label",
                          defaultValue: "Hybrid (E2EE + Server)",
                          bundle: .main)
        }
    }

    private func modeDescription(_ mode: E2EAPI.ConversationEncryptionMode) -> String {
        switch mode {
        case .e2ee:
            return String(localized: "conversation.encryption.mode.e2ee.description",
                          defaultValue: "Maximum privacy. Automatic translation is not available.",
                          bundle: .main)
        case .server:
            return String(localized: "conversation.encryption.mode.server.description",
                          defaultValue: "Server protected. Translation remains available (recommended).",
                          bundle: .main)
        case .hybrid:
            return String(localized: "conversation.encryption.mode.hybrid.description",
                          defaultValue: "Double layer. Slower, translation preserved.",
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
            errorMessage = String(localized: "conversation.encryption.detail.readStatusError",
                                  defaultValue: "Unable to read status: \(error.localizedDescription)",
                                  bundle: .main)
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
