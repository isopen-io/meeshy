// MARK: - Extracted from ConversationView.swift
import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Multi-Message Selection (#4005)

/// **Un lecteur sans interface de sélection rend la main au Script** (#11224) :
/// la Rivière et le Résumé n'ont ni coche ni toucher de sélection, et la barre
/// s'ouvrirait derrière eux sur des messages qu'on ne voit pas.
enum ConversationSelectionHost {
    static func landing(from mode: ConversationReadingMode) -> ConversationReadingMode? {
        switch mode {
        case .river, .summary: return .script
        case .focal, .script, .bubbles: return nil
        }
    }
}

extension ConversationView {

    /// **Entre en mode sélection, en semant le premier message tapé** — point
    /// d'entrée UNIQUE (menus d'appui long), comme `beginEdit`/`presentLongPressMenu`.
    func beginSelectionMode(seedingWith messageId: String) {
        overlayState.showOverlayMenu = false
        if let landing = ConversationSelectionHost.landing(from: readingModeController.mode) {
            readingModeController.select(landing)
            scrollState.scrollToMessageId = messageId
            scrollState.scrollToMessageTrigger += 1
        }
        overlayState.isSelectionModeActive = true
        overlayState.selectedMessageIds = [messageId]
        HapticFeedback.light()
    }

    /// Quitte le mode : la sélection ne survit JAMAIS à la sortie.
    func endSelectionMode() {
        overlayState.isSelectionModeActive = false
        overlayState.selectedMessageIds = []
    }

    /// Bascule UN message, plafonné à `selectionCap` (« maximum 100 messages », 2026-08-27) :
    /// un 101ᵉ est un NO-OP signalé (haptique d'erreur + toast), jamais un dépassement silencieux.
    func toggleMessageSelection(_ messageId: String) {
        if overlayState.selectedMessageIds.contains(messageId) {
            overlayState.selectedMessageIds.remove(messageId)
            HapticFeedback.light()
            return
        }
        guard overlayState.selectedMessageIds.count < ConversationOverlayState.selectionCap else {
            HapticFeedback.error()
            FeedbackToastManager.shared.showError(
                String(localized: "conversation.selection.capReached", defaultValue: "Maximum 100 messages", bundle: .main)
            )
            return
        }
        overlayState.selectedMessageIds.insert(messageId)
        HapticFeedback.light()
    }

    /// La sélection dans l'ORDRE du fil, jamais l'ordre de tap : un transfert groupé garde l'ordre de lecture.
    var selectedMessagesInThreadOrder: [Message] {
        viewModel.messages.filter { overlayState.selectedMessageIds.contains($0.id) }
    }

    /// **Un message non transférable retire « Transférer » à la sélection** (#9573) : la loi de sortie
    /// le refuse (vue unique, flamme après lecture, flou) ; le bouton n'est pas rendu, jamais grisé.
    var selectionOffersForward: Bool {
        MessageExitOffer.selectionOffersForward(selectedMessagesInThreadOrder)
    }

    /// #4024 — « pour tous » exige que TOUS soient éligibles (miens, non supprimés, sans fenêtre — #11214).
    var selectionAllowsDeleteForAll: Bool {
        let selected = selectedMessagesInThreadOrder
        guard !selected.isEmpty else { return false }
        return selected.allSatisfy { viewModel.canDeleteForEveryone($0) }
    }

    /// « Pour moi » n'est offert que si un message au moins est admis par la loi, ou n'est jamais parti (#11221).
    var selectionAllowsDeleteForMe: Bool {
        !ConversationForMeRemoval(viewModel: viewModel).plan(overlayState.selectedMessageIds, authority: menuAuthority).isEmpty
    }

    /// #4024 — supprime la sélection, puis quitte le mode : « pour moi » en UNE requête (#11221).
    func deleteSelectedMessages(mode: ConversationViewModel.DeleteMode) {
        let ids = overlayState.selectedMessageIds
        let (removal, authority) = (ConversationForMeRemoval(viewModel: viewModel), menuAuthority)
        endSelectionMode()
        Task {
            guard mode == .everyone else { return await removal.runSelection(ids, authority: authority) }
            for id in ids { await viewModel.deleteMessage(messageId: id, mode: mode) }
        }
    }

    /// **La barre d'action du mode sélection (#4005).** Remplace le composer
    /// tant que la sélection est active — voir le site de montage
    /// (`ConversationView.body`, branche `isSelectionModeActive`).
    var selectionToolbar: some View {
        HStack(spacing: MeeshySpacing.lg) {
            Button {
                endSelectionMode()
            } label: {
                Text(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .medium))
            }
            .accessibilityIdentifier("conversation.selection.cancel")

            // #4024 — Supprimer, à côté d'Annuler. Ouvre la confirmation
            // groupée (pour tous / pour moi, gardée par
            // `selectionAllowsDeleteForAll`) — jamais de suppression directe
            // sans confirmation, même règle que la suppression d'un message.
            Button(role: .destructive) {
                overlayState.deleteConfirmSelectionActive = true
            } label: {
                Image(systemName: "trash")
            }
            .disabled(overlayState.selectedMessageIds.isEmpty)
            .accessibilityLabel(String(localized: "conversation.view.delete_message.title", bundle: .main))
            .accessibilityIdentifier("conversation.selection.delete")

            Spacer(minLength: 0)

            // #4023 — « N sélectionnés » tout court, et affiché SEULEMENT au-delà
            // d'un élément (un seul sélectionné ⇒ pas de compteur).
            if overlayState.selectedMessageIds.count >= 2 {
                Text(selectionCountLabel)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                    .foregroundColor(ThemeManager.shared.textSecondary)
                    .accessibilityIdentifier("conversation.selection.count")
            }

            Spacer(minLength: 0)

            if selectionOffersForward {
                Button {
                    let selected = selectedMessagesInThreadOrder
                    guard let first = selected.first, MessageExitOffer.selectionOffersForward(selected) else { return }
                    composerState.forwardMessage = first
                    composerState.forwardAdditionalMessages = Array(selected.dropFirst())
                    endSelectionMode()
                } label: {
                    Label(
                        String(localized: "message-detail.tab.forward", defaultValue: "Transférer", bundle: .main),
                        systemImage: "arrowshape.turn.up.right"
                    )
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                }
                .disabled(overlayState.selectedMessageIds.isEmpty)
                .accessibilityIdentifier("conversation.selection.forward")
            }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.md)
        .background(.regularMaterial)
    }

    /// « N sélectionnés » (#4023) — libellé court, sans le mot « message », le
    /// compteur n'étant montré qu'à partir de 2 éléments (voir `selectionToolbar`).
    /// Un simple `%d` suffit : le compte ne dépasse jamais `selectionCap`.
    private var selectionCountLabel: String {
        let n = overlayState.selectedMessageIds.count
        let format = String(localized: "conversation.selection.count", defaultValue: "%d sélectionnés", bundle: .main)
        return String(format: format, n)
    }
}
