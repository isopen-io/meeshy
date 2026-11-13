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
    /// Le mode vers lequel basculer, en attente de confirmation (le bout en bout ne se quitte pas).
    @State private var pendingSwitch: ConversationEncryptionModeChoice?
    @State private var isOpeningPair = false
    /// Cet appareil a vu la conversation chiffrée de bout en bout : elle le reste (#12949).
    @State private var remembersEndToEnd = false
    /// Un seul (i) ouvert par fiche (épure #18078).
    @State private var openNoteID: String?

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
                case .active(let offersModeSwitch):
                    let mode = displayedMode.flatMap(ConversationEncryptionModeChoice.init(rawValue:))
                    if let status, let mode {
                        activeStateSections(mode: mode, status: status)
                    }
                    if let servedGap { servedGapSection(servedGap) }
                    if explanation.regime == .endToEnd, let peer { readableDirectSection(peer) }
                    pairEndToEndSection
                    if offersModeSwitch, let mode { modeSwitchSection(from: mode) }
                    ConversationEncryptionExplanationSections(explanation: explanation, openNoteID: $openNoteID)
                case .activation:
                    inactiveStateSection
                    pairEndToEndSection
                    ConversationEncryptionExplanationSections(explanation: explanation, openNoteID: $openNoteID)
                    enableStateSections
                case .inactiveReadOnly:
                    inactiveStateSection
                    pairEndToEndSection
                    ConversationEncryptionExplanationSections(explanation: explanation, openNoteID: $openNoteID)
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(MeeshyColors.error)
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
                String(localized: "conversation.encryption.detail.switchToEndToEndConfirmTitle",
                       defaultValue: "Passer au chiffrement de bout en bout ?", bundle: .main),
                isPresented: Binding(get: { pendingSwitch != nil }, set: { if !$0 { pendingSwitch = nil } }),
                titleVisibility: .visible,
                presenting: pendingSwitch
            ) { target in
                Button(String(localized: "conversation.encryption.detail.switchToEndToEndConfirm",
                              defaultValue: "Passer en bout en bout", bundle: .main)) {
                    Task { await switchMode(to: target) }
                }
                Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) {}
            } message: { _ in
                Text(String(localized: "conversation.encryption.create.footer",
                            defaultValue: "Le chiffrement de bout en bout ne se désactive jamais.",
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
                    .foregroundStyle(MeeshyColors.success)
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
                        .foregroundStyle(Color.secondary)
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

    // MARK: - Le chiffrement au repos ne se désactive plus : il change de mode

    /// Une conversation `server` ou `hybrid` passe directement à un autre mode,
    /// bout en bout compris ; ce dernier se confirme, on n'en revient pas.
    private func modeSwitchSection(from current: ConversationEncryptionModeChoice) -> some View {
        Section {
            ForEach(ConversationEncryptionModeSwitch.targets(from: current), id: \.self) { target in
                Button {
                    if ConversationEncryptionModeSwitch.requiresConfirmation(target) {
                        pendingSwitch = target
                    } else {
                        Task { await switchMode(to: target) }
                    }
                } label: {
                    HStack(spacing: MeeshySpacing.md) {
                        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                            Text(modeLabel(target))
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.primary)
                            Text(modeDescription(target))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer()
                        Image(systemName: "chevron.forward")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .accessibilityHidden(true)
                    }
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .disabled(isSwitching)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("encryption-switch-\(target.rawValue)")
            }
        } header: {
            Text(String(localized: "conversation.encryption.detail.switchHeader",
                        defaultValue: "Changer de mode",
                        bundle: .main))
        } footer: {
            finalFooter(String(localized: "conversation.encryption.create.footer",
                               defaultValue: "Le chiffrement de bout en bout ne se désactive jamais.",
                               bundle: .main))
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
                                defaultValue: "Ouvrir une conversation sans chiffrement de bout en bout avec \(peer.name)",
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
                                  defaultValue: "Hors connexion : reconnectez-vous pour l’ouvrir.",
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
                     defaultValue: "Rétablissez d’abord le chiffrement ici, puis ouvrez l’autre conversation.",
                     bundle: .main)
            : String(localized: "conversation.encryption.detail.plaintextDirectFailed",
                     defaultValue: "Ouverture impossible. Réessayez.",
                     bundle: .main)
        HapticFeedback.error()
    }

    // MARK: - Un régime servi qui ne dit plus le bout en bout

    private func servedGapSection(_ gap: ConversationEncryptionServedGap) -> some View {
        Section {
            MeeshyInfoNoted(note: ConversationEncryptionRevertNote.note(), openNoteID: $openNoteID) {
                Text(String(localized: "conversation.encryption.detail.servedGap",
                            defaultValue: "Vue chiffrée de bout en bout ici : elle le reste, quoi que présente le serveur.",
                            bundle: .main))
                    .font(.subheadline)
            }
            if gap == .restorable {
                Button {
                    selectedMode = .e2ee
                    Task { await switchMode(to: .e2ee) }
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
                    .foregroundStyle(MeeshyColors.warning)
                    // Decorative status glyph — "Unencrypted conversation" title +
                    // subtitle carry the state, so hide the symbol from VoiceOver.
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                    Text(String(localized: "conversation.encryption.detail.inactiveLabel",
                                defaultValue: "Conversation non chiffrée",
                                bundle: .main))
                        .font(.headline)
                    Text(String(localized: "conversation.encryption.detail.inactiveSubtitle",
                                defaultValue: "Créée avant le chiffrement systématique.",
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
                            .foregroundStyle(Color.secondary)
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
            finalFooter(String(localized: "conversation.encryption.detail.activationFooterFinal",
                               defaultValue: "Le chiffrement ne se désactive jamais, de bout en bout comme sur nos serveurs.",
                               bundle: .main))
        }

        Section {
            Button {
                if ConversationEncryptionModeSwitch.requiresConfirmation(selectedMode) {
                    pendingSwitch = selectedMode
                } else {
                    Task { await switchMode(to: selectedMode) }
                }
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

    /// Le pied « ne se désactive jamais » : la phrase d'état reste entière et visible, le reste derrière un (i).
    private func finalFooter(_ text: String) -> some View {
        MeeshyInfoNoted(note: ConversationEncryptionRevertNote.note(), openNoteID: $openNoteID) {
            Text(text)
                .font(.caption)
        }
    }

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

    private func modeLabel(_ mode: ConversationEncryptionModeChoice) -> String { mode.label }

    private func modeDescription(_ mode: ConversationEncryptionModeChoice) -> String { mode.summary }

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

    /// Activer ou changer de mode : `POST /conversations/:id/encryption` passe
    /// directement de `server` / `hybrid` au mode demandé.
    private func switchMode(to mode: ConversationEncryptionModeChoice) async {
        await switchRegime { try await service.enable(conversationId: conversationId, mode: mode.rawValue) }
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
                                  defaultValue: "Une conversation chiffrée de bout en bout existe déjà avec cette personne : ouvrez-la.",
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
