import SwiftUI
import os
import MeeshySDK
import MeeshyUI

struct ConversationEncryptionDetailSheet: View {
    let conversationId: String
    let accentColor: String
    /// Le droit d'activer selon le rôle, tant que la passerelle n'a pas servi le sien (`canToggleEncryption`).
    let fallbackMayToggle: Bool
    /// Un groupe s'explique sans s'activer depuis iOS (#12844).
    var isDirect: Bool = true
    var service: any ConversationEncryptionServiceProviding = ConversationEncryptionService.shared
    var ledger: EndToEndRegimeLedger = .shared

    @Environment(\.dismiss) private var dismiss
    @State private var status: ConversationEncryptionStatus?
    @State private var isLoading = true
    @State private var isSwitching = false
    @State private var selectedMode: ConversationEncryptionModeChoice = .server
    @State private var errorMessage: String?
    /// Cet appareil a vu la conversation chiffrée de bout en bout : elle le reste (#12949).
    @State private var remembersEndToEnd = false

    private var mayToggle: Bool { isDirect && !remembersEndToEnd && (status?.canToggleEncryption ?? fallbackMayToggle) }

    /// Le serveur sert sans bout en bout une conversation que cet appareil a vue
    /// chiffrée (#12949, audit #12950) : l'écart se dit, et seul le sens qui
    /// ferme est proposé.
    private var servedGap: ConversationEncryptionServedGap? {
        ConversationEncryptionServedGap.resolve(
            remembersEndToEnd: remembersEndToEnd, servedEndToEnd: status?.isEndToEnd,
            mayRestore: isDirect && (status?.canToggleEncryption ?? fallbackMayToggle)
        )
    }

    /// Le mode que la fiche décrit : le bout en bout vu par cet appareil
    /// l'emporte sur un régime servi qui ne le dit plus.
    private var displayedMode: String? {
        remembersEndToEnd ? E2EEWire.mode : (status?.isEncrypted == true ? status?.mode : nil)
    }

    /// Ce que la fiche explique de la conversation ouverte (#12880).
    private var explanation: ConversationEncryptionExplanation {
        ConversationEncryptionExplanation(mode: displayedMode, isDirect: isDirect)
    }

    private static let logger = MeeshyLog.logger(.conversationEncryption)

    var body: some View {
        NavigationStack {
            Form {
                switch ConversationEncryptionDetailContent.resolve(
                    isLoading: isLoading,
                    isEncrypted: displayedMode != nil,
                    mayToggle: mayToggle
                ) {
                case .loading:
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
                case .active:
                    if let status, let mode = displayedMode.flatMap(ConversationEncryptionModeChoice.init(rawValue:)) {
                        activeStateSections(mode: mode, status: status)
                    }
                    if let servedGap { servedGapSection(servedGap) }
                    ConversationEncryptionExplanationSections(explanation: explanation)
                case .activation:
                    inactiveStateSection
                    ConversationEncryptionExplanationSections(explanation: explanation)
                    enableStateSections
                case .inactiveReadOnly:
                    inactiveStateSection
                    ConversationEncryptionExplanationSections(explanation: explanation)
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
    private func activeStateSections(mode: ConversationEncryptionModeChoice, status: ConversationEncryptionStatus) -> some View {
        Section {
            HStack(spacing: MeeshySpacing.md) {
                Image(systemName: "lock.shield.fill")
                    .font(.title2)
                    .foregroundColor(MeeshyColors.success)
                    // Decorative status glyph — the adjacent "Active encryption"
                    // title + mode subtitle carry the state, so hide the symbol
                    // from VoiceOver rather than reading its SF Symbol name.
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                    Text(String(localized: "conversation.encryption.detail.activeLabel",
                                defaultValue: "Chiffrement actif",
                                bundle: .main))
                        .font(.headline)
                    Text(modeLabel(mode))
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
            }
            .padding(.vertical, MeeshySpacing.xs)
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
                           value: translationLabel(status))
        } header: {
            Text(String(localized: "conversation.encryption.detail.detailsHeader",
                        defaultValue: "Détails",
                        bundle: .main))
        }

    }

    // MARK: - Un régime servi qui ne dit plus le bout en bout

    private func servedGapSection(_ gap: ConversationEncryptionServedGap) -> some View {
        Section {
            Text(String(localized: "conversation.encryption.detail.servedGap",
                        defaultValue: "Le serveur présente cette conversation sans chiffrement de bout en bout, mais cet appareil l’a vue chiffrée : rien n’y part en clair. Pour échanger en clair, créez une nouvelle conversation.",
                        bundle: .main))
                .font(.subheadline)
            if gap == .restorable {
                Button {
                    selectedMode = .e2ee
                    Task { await activate() }
                } label: {
                    Text(String(localized: "conversation.encryption.detail.restoreEndToEnd",
                                defaultValue: "Rétablir le chiffrement de bout en bout",
                                bundle: .main))
                        .fontWeight(.semibold)
                }
                .disabled(isSwitching)
                .accessibilityIdentifier("encryption-restore-e2ee")
            }
        }
    }

    // MARK: - Enable state

    private var inactiveStateSection: some View {
        Section {
            HStack(spacing: MeeshySpacing.md) {
                Image(systemName: "lock.open")
                    .font(.title2)
                    .foregroundColor(MeeshyColors.warning)
                    // Decorative status glyph — "Unencrypted conversation" title +
                    // subtitle carry the state, so hide the symbol from VoiceOver.
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                    Text(String(localized: "conversation.encryption.detail.inactiveLabel",
                                defaultValue: "Conversation non chiffrée",
                                bundle: .main))
                        .font(.headline)
                    Text(String(localized: "conversation.encryption.detail.inactiveSubtitle",
                                defaultValue: "Les messages sont stockés en clair sur le serveur.",
                                bundle: .main))
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            .padding(.vertical, MeeshySpacing.xs)
        }
    }

    @ViewBuilder
    private var enableStateSections: some View {
        Section {
            Picker(String(localized: "conversation.encryption.detail.modeLabel",
                          defaultValue: "Mode",
                          bundle: .main),
                   selection: $selectedMode) {
                ForEach(ConversationEncryptionModeChoice.allCases, id: \.self) { mode in
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
            .disabled(isSwitching)
        } header: {
            Text(String(localized: "conversation.encryption.detail.modeHeader",
                        defaultValue: "Mode",
                        bundle: .main))
        } footer: {
            Text(String(localized: "conversation.encryption.detail.activationFooterFinal",
                        defaultValue: "Une fois activé, le chiffrement de bout en bout ne se désactive plus : pour échanger en clair, il faudra une nouvelle conversation. Choisissez le mode adapté à vos besoins de traduction et de confidentialité.",
                        bundle: .main))
                .font(.caption)
        }

        Section {
            Button {
                Task { await activate() }
            } label: {
                HStack {
                    Spacer()
                    if isSwitching {
                        ProgressView().tint(.white)
                    } else {
                        Image(systemName: "lock.fill")
                            // Decorative glyph inside the button — the "Enable
                            // encryption" text is the button's spoken label.
                            .accessibilityHidden(true)
                        Text(String(localized: "conversation.encryption.detail.activate",
                                    defaultValue: "Activer le chiffrement",
                                    bundle: .main)).fontWeight(.semibold)
                    }
                    Spacer()
                }
            }
            .listRowBackground(Color(hex: accentColor))
            .foregroundColor(.white)
            .disabled(isSwitching)
        }
    }

    // MARK: - Helpers

    /// En bout en bout, la traduction n'est pas absente : elle se fait sur l'appareil (#12880).
    private func translationLabel(_ status: ConversationEncryptionStatus) -> String {
        if explanation.regime == .endToEnd {
            return String(localized: "conversation.encryption.detail.translation.onDevice", defaultValue: "Sur l’appareil", bundle: .main)
        }
        if status.canTranslate {
            return String(localized: "conversation.encryption.detail.translation.available", defaultValue: "Disponible", bundle: .main)
        }
        return String(localized: "conversation.encryption.detail.translation.disabled", defaultValue: "Désactivé", bundle: .main)
    }

    private func modeLabel(_ mode: ConversationEncryptionModeChoice) -> String {
        switch mode {
        case .e2ee:
            return String(localized: "conversation.encryption.mode.e2ee.label",
                          defaultValue: "Bout en bout (sur vos appareils)",
                          bundle: .main)
        case .server:
            return String(localized: "conversation.encryption.mode.server.label",
                          defaultValue: "Serveur (AES-256-GCM)",
                          bundle: .main)
        case .hybrid:
            return String(localized: "conversation.encryption.mode.hybrid.label",
                          defaultValue: "Hybride (chiffré sur le serveur)",
                          bundle: .main)
        }
    }

    private func modeDescription(_ mode: ConversationEncryptionModeChoice) -> String {
        switch mode {
        case .e2ee:
            return String(localized: "conversation.encryption.mode.e2ee.description",
                          defaultValue: "Seuls les appareils des participants lisent les messages. La traduction se fait sur l’appareil.",
                          bundle: .main)
        case .server:
            return String(localized: "conversation.encryption.mode.server.description",
                          defaultValue: "Chiffré sur le serveur. Le serveur peut lire les messages : la traduction reste disponible (recommandé).",
                          bundle: .main)
        case .hybrid:
            return String(localized: "conversation.encryption.mode.hybrid.description",
                          defaultValue: "Chiffré sur le serveur, comme le mode Serveur : le serveur peut lire et traduire les messages.",
                          bundle: .main)
        }
    }

    private func loadStatus() async {
        isLoading = true
        remembersEndToEnd = ledger.remembersEndToEnd(conversationId)
        defer { isLoading = false }
        do {
            let fetched = try await service.fetchStatus(conversationId: conversationId)
            status = fetched
            ledger.learn(fetched, for: conversationId)
            remembersEndToEnd = ledger.remembersEndToEnd(conversationId)
        } catch {
            Self.logger.error("loadStatus failed: \(error.localizedDescription)")
            errorMessage = String(localized: "conversation.encryption.detail.readStatusError",
                                  defaultValue: "Impossible de lire l'état : \(error.localizedDescription)",
                                  bundle: .main)
        }
    }

    private func activate() async {
        await switchRegime { try await service.enable(conversationId: conversationId, mode: selectedMode.rawValue) }
    }

    /// L'activation : le régime servi devient l'état de la fiche ET ce que le fil
    /// ouvert derrière elle sait (#11379, #12522). Une bascule concurrente
    /// (409 `E2EE_REGIME_CHANGED`) relit l'état au lieu d'échouer en silence.
    private func switchRegime(_ perform: () async throws -> ConversationEncryptionStatus) async {
        isSwitching = true
        errorMessage = nil
        defer { isSwitching = false }
        do {
            let result = try await perform()
            status = result
            ledger.learn(result, for: conversationId)
            remembersEndToEnd = ledger.remembersEndToEnd(conversationId)
            HapticFeedback.success()
        } catch let error as MeeshyError where error.e2eeCode == E2EEErrorCode.regimeChanged {
            await loadStatus()
            errorMessage = String(localized: "conversation.encryption.detail.regimeChanged",
                                  defaultValue: "Le chiffrement vient d’être modifié par un autre membre : l’état est actualisé.",
                                  bundle: .main)
            HapticFeedback.error()
        } catch {
            errorMessage = error.localizedDescription
            HapticFeedback.error()
        }
    }
}
