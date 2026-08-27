// MARK: - Extracted from ConversationView.swift
import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Multi-Message Selection (#4005)

extension ConversationView {

    /// **Entre en mode sélection, en semant le premier message tapé.**
    /// Appelée depuis « Sélectionner » (menu longpress custom ET natif) —
    /// point d'entrée UNIQUE, comme `beginEdit`/`presentLongPressMenu`.
    func beginSelectionMode(seedingWith messageId: String) {
        overlayState.showOverlayMenu = false
        overlayState.isSelectionModeActive = true
        overlayState.selectedMessageIds = [messageId]
        HapticFeedback.light()
    }

    /// Quitte le mode sélection — la sélection ne survit JAMAIS à la sortie
    /// (pas de sélection résiduente qui réapparaîtrait au prochain longpress).
    func endSelectionMode() {
        overlayState.isSelectionModeActive = false
        overlayState.selectedMessageIds = []
    }

    /// Bascule UN message dans la sélection, plafonné à
    /// `ConversationOverlayState.selectionCap` (retour porteur 2026-08-27 :
    /// « maximum 100 messages »). Tenter d'en ajouter un 101ᵉ est un NO-OP
    /// signalé (haptique d'erreur + toast), jamais un dépassement silencieux.
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

    /// Les messages sélectionnés, dans l'ORDRE du fil (pas l'ordre de tap) —
    /// un transfert groupé qui inverserait l'ordre de lecture serait un
    /// défaut, pas un détail.
    private var selectedMessagesInThreadOrder: [Message] {
        viewModel.messages.filter { overlayState.selectedMessageIds.contains($0.id) }
    }

    /// **La barre d'action du mode sélection (#4005).** Remplace le composer
    /// tant que la sélection est active — voir le site de montage
    /// (`ConversationView.body`, branche `isSelectionModeActive`).
    var selectionToolbar: some View {
        HStack(spacing: 16) {
            Button {
                endSelectionMode()
            } label: {
                Text(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main))
                    .font(MeeshyFont.relative(15, weight: .medium))
            }
            .accessibilityIdentifier("conversation.selection.cancel")

            Spacer(minLength: 0)

            // #4023 — « N sélectionnés » tout court, et affiché SEULEMENT au-delà
            // d'un élément (un seul sélectionné ⇒ pas de compteur).
            if overlayState.selectedMessageIds.count >= 2 {
                Text(selectionCountLabel)
                    .font(MeeshyFont.relative(13))
                    .foregroundColor(ThemeManager.shared.textSecondary)
                    .accessibilityIdentifier("conversation.selection.count")
            }

            Spacer(minLength: 0)

            Button {
                let selected = selectedMessagesInThreadOrder
                guard let first = selected.first else { return }
                composerState.forwardMessage = first
                composerState.forwardAdditionalMessages = Array(selected.dropFirst())
                endSelectionMode()
            } label: {
                Label(
                    String(localized: "message-detail.tab.forward", defaultValue: "Transférer", bundle: .main),
                    systemImage: "arrowshape.turn.up.right"
                )
                .font(MeeshyFont.relative(15, weight: .semibold))
            }
            .disabled(overlayState.selectedMessageIds.isEmpty)
            .accessibilityIdentifier("conversation.selection.forward")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
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
