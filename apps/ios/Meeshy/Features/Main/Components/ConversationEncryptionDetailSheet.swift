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
    /// Le contact d'un tête-à-tête : l'autre fil de la paire s'ouvre à son nom (#12966).
    var peer: ConversationEncryptionPeer?
    var onOpenConversation: (String) -> Void = { _ in }
    var isOnline: () -> Bool = { NetworkMonitor.shared.isOnline }
    var service: any ConversationEncryptionServiceProviding = ConversationEncryptionService.shared
    var ledger: EndToEndRegimeLedger = .shared

    @Environment(\.dismiss) private var dismiss
    @State private var status: ConversationEncryptionStatus?
    @State private var isLoading = true
    @State private var isSwitching = false
    @State private var selectedMode: ConversationEncryptionModeChoice = .server
    @State private var errorMessage: String?
    @State private var confirmsDeactivation = false
    @State private var isOpeningPair = false
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
                    isEndToEnd: explanation.regime == .endToEnd,
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
                    if let status, let mode = displayedMode.flatMap(ConversationEncryptionModeChoice.init(rawValue:)) {
                        activeStateSections(mode: mode, status: status)
                    }
                    if let servedGap { servedGapSection(servedGap) }
                    if explanation.regime == .endToEnd, let peer { readableDirectSection(peer) }
                    pairEndToEndSection
                    ConversationEncryptionExplanationSections(explanation: explanation)
                    if offersDeactivation { atRestDeactivationSection }
                case .activation:
                    inactiveStateSection
                    pairEndToEndSection
                    ConversationEncryptionExplanationSections(explanation: explanation)
                    enableStateSections
                case .inactiveReadOnly:
                    inactiveStateSection
                    pairEndToEndSection
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
                String(localized: "conversation.encryption.detail.deactivateAtRestConfirmTitle",
                       defaultValue: "Désactiver le chiffrement sur le serveur ?", bundle: .main),
                isPresented: $confirmsDeactivation,
                titleVisibility: .visible
            ) {
                Button(String(localized: "conversation.encryption.detail.deactivate",
                              defaultValue: "Désactiver le chiffrement", bundle: .main), role: .destructive) {
                    Task { await switchRegime { try await service.disable(conversationId: conversationId) } }
                }
                Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) {}
            } message: {
                Text(String(localized: "conversation.encryption.detail.deactivateAtRestConfirmMessage",
                            defaultValue: "Les nouveaux messages seront stockés sans chiffrement sur le serveur. Les messages déjà chiffrés le restent. Chaque membre verra ce changement dans le fil.",
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

    // MARK: - Le chiffrement au repos se désactive (#12522), jamais le bout en bout (#12949)

    private var atRestDeactivationSection: some View {
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
            Text(String(localized: "conversation.encryption.detail.deactivateAtRestFooter",
                        defaultValue: "Seul le chiffrement sur le serveur se désactive : Meeshy lit déjà ces messages, la traduction et la transcription restent disponibles. Le chiffrement de bout en bout, lui, ne se désactive pas.",
                        bundle: .main))
                .font(.caption)
        }
    }

    // MARK: - L'autre tête-à-tête de la paire (#12966)

    /// Dans un tête-à-tête chiffré de bout en bout : ouvrir, à côté, celui que le serveur lit.
    private func readableDirectSection(_ peer: ConversationEncryptionPeer) -> some View {
        Section {
            Button {
                Task { await openReadableDirect(with: peer) }
            } label: {
                HStack {
                    Image(systemName: "bubble.left.and.bubble.right")
                        .accessibilityHidden(true)
                    Text(String(localized: "conversation.encryption.detail.openPlaintextDirect",
                                defaultValue: "Ouvrir une conversation non chiffrée avec \(peer.name)",
                                bundle: .main))
                    Spacer()
                    if isOpeningPair { ProgressView() }
                }
            }
            .disabled(isOpeningPair)
            .accessibilityIdentifier("encryption-open-plaintext-direct")
        }
    }

    /// Dans le tête-à-tête lisible d'une paire qui en a un chiffré de bout en bout : y retourner.
    @ViewBuilder
    private var pairEndToEndSection: some View {
        if explanation.regime != .endToEnd, let pairId = status?.pairEndToEndConversationId, !pairId.isEmpty {
            Section {
                Button {
                    Task { await openPairEndToEnd(pairId) }
                } label: {
                    Label {
                        Text(String(localized: "conversation.encryption.detail.openPairEndToEnd",
                                    defaultValue: "Ouvrir la conversation chiffrée de bout en bout avec \(peer?.name ?? "")",
                                    bundle: .main))
                    } icon: {
                        Image(systemName: "lock.shield").accessibilityHidden(true)
                    }
                }
                .disabled(isOpeningPair)
                .accessibilityIdentifier("encryption-open-pair-e2ee")
            }
        }
    }

    private func openReadableDirect(with peer: ConversationEncryptionPeer) async {
        guard isOnline() else {
            errorMessage = String(localized: "conversation.encryption.detail.plaintextDirectOffline",
                                  defaultValue: "Hors connexion : reconnectez-vous pour ouvrir la conversation non chiffrée.",
                                  bundle: .main)
            return
        }
        isOpeningPair = true
        errorMessage = nil
        defer { isOpeningPair = false }
        guard let opened = try? await service.openReadableDirect(with: peer.userId),
              let served = try? await service.fetchStatus(conversationId: opened)
        else { return failOpeningReadableDirect() }
        ledger.learn(served, for: opened)
        guard let destination = ReadableDirectOpening.destination(
            opened: opened, from: conversationId, openedIsEndToEnd: ledger.remembersEndToEnd(opened)
        ) else {
            return failOpeningReadableDirect(servedGap: ReadableDirectOpening.returnsTheServedGap(opened: opened, from: conversationId))
        }
        dismiss()
        onOpenConversation(destination)
    }

    /// Le chiffré annoncé par le serveur ne s'ouvre que s'il l'est, pour le
    /// serveur ou pour cet appareil : le libellé promet le bout en bout.
    private func openPairEndToEnd(_ pairId: String) async {
        isOpeningPair = true
        errorMessage = nil
        defer { isOpeningPair = false }
        if let served = try? await service.fetchStatus(conversationId: pairId) { ledger.learn(served, for: pairId) }
        guard pairId != conversationId, ledger.remembersEndToEnd(pairId) else {
            errorMessage = String(localized: "conversation.encryption.detail.openPairEndToEndFailed",
                                  defaultValue: "La conversation chiffrée de bout en bout n’a pas pu être ouverte. Réessayez.",
                                  bundle: .main)
            return HapticFeedback.error()
        }
        dismiss()
        onOpenConversation(pairId)
    }

    private func failOpeningReadableDirect(servedGap: Bool = false) {
        errorMessage = servedGap
            ? String(localized: "conversation.encryption.detail.plaintextDirectServedGap",
                     defaultValue: "Le serveur présente déjà ce tête-à-tête sans chiffrement : rétablissez d’abord le chiffrement de bout en bout ici, puis ouvrez la conversation non chiffrée à côté.",
                     bundle: .main)
            : String(localized: "conversation.encryption.detail.plaintextDirectFailed",
                     defaultValue: "La conversation non chiffrée n’a pas pu être ouverte. Réessayez.",
                     bundle: .main)
        HapticFeedback.error()
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
        } catch let error as MeeshyError where error.e2eeCode == E2EEErrorCode.directAlreadyEndToEnd {
            await loadStatus()
            errorMessage = String(localized: "conversation.encryption.detail.directAlreadyEndToEnd",
                                  defaultValue: "Vous avez déjà une conversation chiffrée de bout en bout avec cette personne : ouvrez-la pour échanger chiffré. Celle-ci reste lisible par le serveur.",
                                  bundle: .main)
            HapticFeedback.error()
        } catch let error as MeeshyError where error.e2eeCode == E2EEErrorCode.directNotAPair {
            errorMessage = String(localized: "conversation.encryption.detail.directNotAPair",
                                  defaultValue: "Ce tête-à-tête ne réunit pas exactement deux membres inscrits : le chiffrement de bout en bout n’y est pas possible.",
                                  bundle: .main)
            HapticFeedback.error()
        } catch let error as MeeshyError where error.e2eeCode == E2EEErrorCode.regimeChanged || error.e2eeCode == E2EEErrorCode.irreversible {
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
