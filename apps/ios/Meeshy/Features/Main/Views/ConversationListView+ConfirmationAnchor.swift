import SwiftUI
import MeeshySDK
import MeeshyUI

extension ConversationListView {
    /// **Les confirmations de la liste s'ancrent sur un POINT** (même correctif que #10806 pour la conversation).
    /// Posées sur la liste entière, elles devenaient sur iPad un popover ancré au cadre de la colonne, que UIKit
    /// présentait par-dessus la conversation ouverte à côté — et y cachait « Annuler ». Sur iPhone, rien ne change :
    /// la feuille d'actions monte du bas.
    var listConfirmationAnchor: some View {
        Color.clear
            .frame(width: 1, height: 1)
            .accessibilityHidden(true)
            .confirmationDialog(
                String(localized: "block.confirm.title"),
                isPresented: $showBlockConfirmation,
                titleVisibility: .visible
            ) {
                Button(String(localized: "action.block"), role: .destructive) {
                    guard let conv = sheetTargets.blockTarget,
                          let targetUserId = conv.participantUserId else { return }
                    Task {
                        await BlockActionCoordinator.shared.block(userId: targetUserId)
                        await conversationViewModel.archiveConversation(conversationId: conv.id)
                        HapticFeedback.success()
                    }
                }
                Button(String(localized: "action.cancel"), role: .cancel) {}
            } message: {
                Text(String(localized: "block.confirm.message"))
            }
            // Suppression = callback destructif → TOUJOURS confirmée par le
            // dialog système (rendu natif de l'OS courant, Liquid Glass sur
            // iOS 26), déclenchée depuis le menu custom ET le swipe « hide ».
            .confirmationDialog(
                hidesDeleteTarget
                    ? String(localized: "conversation.hide.confirm.title", defaultValue: "Masquer la discussion ?", bundle: .main)
                    : String(localized: "conversation.delete.confirm.title", defaultValue: "Supprimer la conversation ?", bundle: .main),
                isPresented: Binding(
                    get: { sheetTargets.deleteTarget != nil },
                    set: { if !$0 { sheetTargets.deleteTarget = nil } }
                ),
                titleVisibility: .visible,
                presenting: sheetTargets.deleteTarget
            ) { conversation in
                Button(ConversationContextMenuView.removalLabel(rowMenuCapabilities(for: conversation).removal ?? .delete), role: .destructive) {
                    HapticFeedback.heavy()
                    Task { await conversationViewModel.deleteConversation(conversationId: conversation.id) }
                }
                Button(String(localized: "common.cancel", bundle: .main), role: .cancel) {}
            } message: { conversation in
                Text(String(
                    localized: "conversation.delete.confirm.message",
                    defaultValue: "« \(conversation.name) » sera masquée pour vous. Les autres participants la conservent.",
                    bundle: .main
                ))
            }
    }

    /// Le menu a dit « Masquer la discussion » : la confirmation dit le même mot (#11215).
    private var hidesDeleteTarget: Bool {
        sheetTargets.deleteTarget.map { rowMenuCapabilities(for: $0).removal == .hide } ?? false
    }
}
