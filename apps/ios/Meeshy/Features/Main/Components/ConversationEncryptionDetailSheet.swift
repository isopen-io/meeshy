import SwiftUI
import os
import MeeshySDK
import MeeshyUI

struct ConversationEncryptionDetailSheet: View {
    let conversationId: String
    let accentColor: String
    /// Le droit de basculer selon le rôle, tant que la passerelle n'a pas servi le sien (`canToggleEncryption`).
    let fallbackMayToggle: Bool
    /// Un groupe s'explique sans se basculer depuis iOS (#12844).
    var isDirect: Bool = true
    var service: any ConversationEncryptionServiceProviding = ConversationEncryptionService.shared
    var ledger: EndToEndRegimeLedger = .shared

    @Environment(\.dismiss) private var dismiss
    @State private var status: ConversationEncryptionStatus?
    @State private var isLoading = true
    @State private var isSwitching = false
    @State private var confirmsDeactivation = false
    @State private var justDisabled = false
    @State private var selectedMode: ConversationEncryptionModeChoice = .server
    @State private var errorMessage: String?
    @State private var pendingDowngrade: EndToEndRegimeLedger.PendingDowngrade?

    private var mayToggle: Bool { isDirect && (status?.canToggleEncryption ?? fallbackMayToggle) }

    /// Ce que la fiche explique de la conversation ouverte (#12880), d'après le régime servi.
    private var explanation: ConversationEncryptionExplanation {
        ConversationEncryptionExplanation(mode: status?.isEncrypted == true ? status?.mode : nil, isDirect: isDirect)
    }

    private static let logger = MeeshyLog.logger(.conversationEncryption)

    var body: some View {
        NavigationStack {
            Form {
                switch ConversationEncryptionDetailContent.resolve(
                    isLoading: isLoading,
                    isEncrypted: status?.isEncrypted == true && status?.mode != nil,
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
                case .active(let offersDeactivation):
                    if let status, let mode = status.mode.flatMap(ConversationEncryptionModeChoice.init(rawValue:)) {
                        activeStateSections(mode: mode, status: status)
                        ConversationEncryptionExplanationSections(explanation: explanation)
                        if offersDeactivation { deactivationSection }
                    }
                case .activation:
                    inactiveStateSection
                    downgradeConfirmationSection
                    ConversationEncryptionExplanationSections(explanation: explanation)
                    enableStateSections
                case .inactiveReadOnly:
                    inactiveStateSection
                    downgradeConfirmationSection
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
            .confirmationDialog(
                String(localized: "conversation.encryption.detail.deactivateConfirmTitle",
                       defaultValue: "Désactiver le chiffrement de bout en bout ?", bundle: .main),
                isPresented: $confirmsDeactivation,
                titleVisibility: .visible
            ) {
                Button(String(localized: "conversation.encryption.detail.deactivate",
                              defaultValue: "Désactiver le chiffrement", bundle: .main), role: .destructive) {
                    Task { await deactivate() }
                }
                Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) {}
            } message: {
                Text(String(localized: "conversation.encryption.detail.deactivateConfirmMessage",
                            defaultValue: "Les nouveaux messages seront lisibles par le serveur, qui pourra les traduire et les transcrire. Les messages déjà chiffrés le restent. Chaque membre verra ce changement dans le fil.",
                            bundle: .main))
            }
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

    // MARK: - Deactivation (#12522)

    private var deactivationSection: some View {
        Section {
            Button(role: .destructive) {
                confirmsDeactivation = true
            } label: {
                HStack {
                    Spacer()
                    if isSwitching {
                        ProgressView()
                    } else {
                        Image(systemName: "lock.open")
                            .accessibilityHidden(true)
                        Text(String(localized: "conversation.encryption.detail.deactivate",
                                    defaultValue: "Désactiver le chiffrement",
                                    bundle: .main)).fontWeight(.semibold)
                    }
                    Spacer()
                }
            }
            .disabled(isSwitching)
            .accessibilityIdentifier("encryption-deactivate")
        } footer: {
            Text(String(localized: "conversation.encryption.detail.deactivationFooter",
                        defaultValue: "Les messages déjà chiffrés le restent et demeurent lisibles sur vos appareils. Les nouveaux messages partiront sans chiffrement de bout en bout : la traduction et la transcription par le serveur reviendront pour eux.",
                        bundle: .main))
                .font(.caption)
        }
    }

    // MARK: - Désactivation annoncée par le serveur (#12846)

    /// Le serveur dit le chiffrement de bout en bout désactivé, et
    /// l'utilisateur ne l'a pas encore vu : l'envoi reste suspendu jusqu'à ce
    /// qu'il le confirme ici, ou que l'avis s'affiche dans le fil.
    @ViewBuilder
    private var downgradeConfirmationSection: some View {
        if let pendingDowngrade {
            Section {
                Text(String(localized: "conversation.encryption.detail.downgradePending",
                            defaultValue: "Cette conversation a été chiffrée de bout en bout, et le serveur la dit maintenant sans chiffrement de bout en bout. Tant que vous ne le confirmez pas, rien ne part dans cette conversation.",
                            bundle: .main))
                    .font(.subheadline)
                Button {
                    ledger.confirm(pendingDowngrade, for: conversationId)
                    self.pendingDowngrade = nil
                    HapticFeedback.success()
                } label: {
                    Text(String(localized: "conversation.encryption.detail.downgradeConfirm",
                                defaultValue: "J’ai compris, écrire sans chiffrement de bout en bout",
                                bundle: .main))
                        .fontWeight(.semibold)
                }
                .accessibilityIdentifier("encryption-downgrade-confirm")
            } footer: {
                Text(String(localized: "conversation.encryption.detail.downgradeFooter",
                            defaultValue: "Les messages déjà chiffrés le restent. Les nouveaux seront lisibles par le serveur, qui pourra les traduire et les transcrire.",
                            bundle: .main))
                    .font(.caption)
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
                    if justDisabled {
                        Text(String(localized: "conversation.encryption.detail.disabledNotice",
                                    defaultValue: "Chiffrement désactivé : la traduction et la transcription par le serveur sont de nouveau disponibles pour les nouveaux messages.",
                                    bundle: .main))
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(MeeshyColors.success)
                    }
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
            Text(String(localized: "conversation.encryption.detail.activationFooterSwitchable",
                        defaultValue: "Vous pourrez le désactiver plus tard : les messages déjà chiffrés le resteront. Choisissez le mode adapté à vos besoins de traduction et de confidentialité.",
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
        if status.canTranslate {
            return String(localized: "conversation.encryption.detail.translation.available", defaultValue: "Disponible", bundle: .main)
        }
        if explanation.regime == .endToEnd {
            return String(localized: "conversation.encryption.detail.translation.onDevice", defaultValue: "Sur l’appareil", bundle: .main)
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
        defer { isLoading = false }
        do {
            let fetched = try await service.fetchStatus(conversationId: conversationId)
            status = fetched
            ledger.learn(fetched, for: conversationId)
            pendingDowngrade = ledger.pendingDowngrade(for: conversationId)
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

    /// Désactiver est le geste de l'utilisateur : il a vu la bascule (#12846).
    private func deactivate() async {
        await switchRegime { try await service.disable(conversationId: conversationId) }
        justDisabled = status?.isEncrypted == false
        if justDisabled, let epoch = status?.epoch {
            ledger.confirmDowngrade(epoch: epoch, for: conversationId)
        }
        pendingDowngrade = ledger.pendingDowngrade(for: conversationId)
    }

    /// Une bascule : le régime servi devient l'état de la fiche ET ce que le fil
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
