// MARK: - Extracted from ConversationView.swift
import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Longpress Menu Presentation (#4004)

extension ConversationView {

    /// **Le point d'entrée UNIQUE du menu longpress (#4004, #11208).**
    ///
    /// Le clavier (et le panneau d'options du composer, même geste) se ferme
    /// AVANT la présentation : un clavier actif mange une partie de l'écran que
    /// le menu doit pouvoir occuper.
    ///
    /// `cellFrame` (`nil` si la cellule n'est pas matérialisée) vient du SITE
    /// D'APPEL UIKit (`MessageListViewController.cellFrameInWindow`, même
    /// patron qu'`onAddReaction`) — **pas** de `frameTracker` (revue
    /// 2026-08-27) : `MessageFramePreferenceKey` ne traverse la frontière UIKit
    /// qu'en mode Rivière (`RiverBubbleView`, seul site qui la publie). Il est
    /// GARDÉ dans `overlayState.overlaySourceFrame` (#11208) : il était reçu
    /// puis jeté, et l'overlay retombait sur un aperçu reconstruit, centré,
    /// loin de la cellule pressée.
    ///
    /// **Ni défilement préalable, ni délai** (#11208). La liste remontait un
    /// message trop bas, puis le menu paraissait 0,3 s plus tard : la liste
    /// bougeait sous le doigt et l'appui long ne répondait pas dans l'image du
    /// geste. L'overlay place lui-même son cluster dans la fenêtre — il le
    /// remonte quand la cellule est trop basse, et `MessageOverlayRevealLaw`
    /// dégage le menu d'un aperçu trop haut.
    ///
    /// L'état désactivé ici (clavier, panneau d'options) est mémorisé dans
    /// `overlayState.restoreAfterLongPress` et restitué par
    /// `restoreStateAfterLongPressIfNeeded()`, appelée quand le menu se
    /// referme.
    func presentLongPressMenu(for message: Message, cellFrame: CGRect?, pieceId: String? = nil) {
        overlayState.overlayMessage = message
        // Fail-closed : un message protégé n'ouvre que l'aperçu du message entier.
        let pieceId = MessagePieceTarget.piece(pieceId, in: message)?.id
        overlayState.overlayPieceId = pieceId
        overlayState.restoreAfterLongPress = (isTyping: isTyping, showOptions: composerState.showOptions)
        isTyping = false
        composerState.showOptions = false
        // #9907 — l'aperçu d'une PIÈCE se présente au centre de l'écran,
        // indépendamment de la cellule.
        overlayState.overlaySourceFrame = pieceId == nil ? cellFrame : nil
        overlayState.showOverlayMenu = true
    }

    /// **Restitue le clavier/panneau d'options désactivés par
    /// `presentLongPressMenu` (#4004).** Appelée quand le menu longpress se
    /// referme (`.onChange(of: overlayState.showOverlayMenu)`, câblé au site
    /// de montage du menu).
    ///
    /// **Sauf en cas d'entrée en édition** : `beginEdit` (appelé par l'action
    /// « Éditer » du menu, sur le MÊME dismiss) veut le clavier OUVERT pour
    /// que l'auteur tape sa modification — restituer l'état PRÉ-longpress
    /// écraserait ce choix. `editingMessageId != nil` juste après la
    /// fermeture est le signal que cette action a été prise.
    func restoreStateAfterLongPressIfNeeded() {
        overlayState.overlaySourceFrame = nil
        guard let saved = overlayState.restoreAfterLongPress else { return }
        overlayState.restoreAfterLongPress = nil
        if composerState.editingMessageId != nil {
            isTyping = true
            return
        }
        // Retour porteur 2026-08-27 : « Sélectionner » (menu longpress)
        // rouvrait le clavier — `showOverlayMenu` retombe à `false` au MÊME
        // dismiss que `beginSelectionMode`, et cette fonction restituait
        // l'état PRÉ-longpress sans savoir qu'une sélection venait de
        // s'ouvrir. Le composer est REMPLACÉ par `selectionToolbar` en mode
        // sélection (voir `ConversationView.body`) — rien à restituer.
        guard !overlayState.isSelectionModeActive else { return }
        isTyping = saved.isTyping
        composerState.showOptions = saved.showOptions
    }

    /// Ce que le fil sert pour `message` — le drapeau de sa cellule et les
    /// pistes qu'il élit, mêmes écrivains que la cellule (#9259) — et ce que la
    /// cellule pose autour de lui : anneau de story, humeur de l'auteur,
    /// dénominateur des accusés, mêmes sources que `messageCellInputs` (#11208).
    func overlayThreadLanguage(for message: Message) -> MessageOverlayMenu.ThreadLanguage {
        let messageId = message.id
        return MessageOverlayMenu.ThreadLanguage(
            selection: viewModel.bubbleLanguageSelections[messageId],
            readingMode: readingModeController.mode,
            servedAudioTracks: viewModel.servedAudioTracks(of: message),
            onSetActiveDisplayLanguage: { viewModel.setBubbleActiveDisplayLanguage($0, for: messageId) },
            onSetSecondaryLanguage: { viewModel.setBubbleSecondaryLanguage($0, for: messageId) },
            senderStoryRing: message.isMe ? .none : storyViewModel.storyRingState(forUserId: message.senderId),
            senderMoodEmoji: statusViewModel.statusForUser(userId: message.senderId)?.moodEmoji,
            recipientCount: MessageCellInputs.recipientCount(
                isDirect: isDirect,
                serverRecipients: message.recipientCount,
                memberCount: viewModel.currentConversation?.memberCount
            )
        )
    }
}

// MARK: - Supprimer UNE pièce (#9906)

extension ConversationView {

    /// Supprime la pièce VISÉE — jamais `attachments.first` par défaut. Sans
    /// visée, un lot ne désigne rien et rien n'est supprimé
    /// (`MessagePieceTarget.deletableMedia`).
    func deleteMedia(targeted attachmentId: String?, of message: Message) {
        guard let target = MessagePieceTarget.deletableMedia(in: message, targeted: attachmentId) else { return }
        Task { await viewModel.deleteAttachment(messageId: message.id, attachmentId: target) }
    }
}

// MARK: - L'aperçu d'UNE pièce (#9907)

extension ConversationView {

    /// L'aperçu de la pièce visée, ou `nil` quand l'appui long vise le message
    /// entier — l'hôte monte alors `MessageOverlayMenu`. « Tout le message »
    /// remet `overlayPieceId` à `nil` : la même surcouche bascule sur l'aperçu
    /// du message, sans se refermer.
    ///
    /// `AnyView`, comme `overlayMenuContent` : le type de l'aperçu n'entre pas
    /// dans celui de `ConversationView.body`.
    func pieceOverlayContent(for message: Message) -> AnyView? {
        guard MessagePieceTarget.piece(overlayState.overlayPieceId, in: message) != nil else { return nil }
        let messageId = message.id
        let menu = MessageMenuContext.make(message: message, viewModel: viewModel, authority: menuAuthority)
        return AnyView(
            MessagePieceOverlay(
                message: message,
                accentHex: accentColor,
                focusedPieceId: $overlayState.overlayPieceId,
                isPresented: $overlayState.showOverlayMenu,
                canDelete: menu.canDeleteOnServer, canForward: menu.canForward,
                canReply: menu.canReply, canReact: menu.canReact,
                onReact: { piece, emoji in
                    viewModel.toggleAttachmentReaction(attachmentId: piece.id, messageId: messageId, emoji: emoji)
                },
                onAction: { action, piece in performPieceAction(action, on: piece, of: message) }
            )
            .transition(.opacity)
            .zIndex(999)
        )
    }

    /// **Le menu d'une pièce agit sur CETTE pièce** (#9908) — chaque entrée
    /// emprunte le chemin que le fil connaît déjà : la citation nommée (le
    /// chemin du plein écran), l'enregistrement par la loi de sortie, la
    /// suppression de la pièce désignée.
    func performPieceAction(_ action: PrimaryAction, on piece: MessageAttachment, of message: Message) {
        switch action {
        case .replyToPiece:
            triggerReply(for: message, citing: piece)
        case .saveMedia:
            if MessageExitTransport.save(message, piece: piece.id, through: mediaSaveCoordinator) { HapticFeedback.light() }
        case .deletePiece:
            deleteMedia(targeted: piece.id, of: message)
        case .forwardPiece:
            composerState.forwardAdditionalMessages = []
            composerState.forwardPieceId = piece.id
            composerState.forwardMessage = message
        default:
            break
        }
    }

    /// **Les confirmations de suppression s'ancrent sur un POINT au centre de la
    /// conversation** (#10806). Posées sur la racine de l'écran, elles devenaient
    /// sur iPad un popover ancré au cadre entier de la colonne, que UIKit
    /// présentait sur la liste des conversations voisine. Sur iPhone, rien ne
    /// change : la feuille d'actions monte du bas.
    var messageDeleteConfirmationAnchor: some View {
        Color.clear
            .frame(width: 1, height: 1)
            .accessibilityHidden(true)
            .confirmationDialog(
                String(localized: "conversation.view.delete_message.title", bundle: .main),
                isPresented: Binding(
                    get: { overlayState.deleteConfirmMessageId != nil },
                    set: { if !$0 { overlayState.deleteConfirmMessageId = nil } }
                ),
                titleVisibility: .visible,
                presenting: overlayState.deleteConfirmMessageId
            ) { msgId in
                // Les verdicts de la fabrique (#11214) : pour tous, retirer, pour moi.
                let verdicts = MessageMenuContext.make(messageId: msgId, viewModel: viewModel, authority: menuAuthority)
                if verdicts.canDeleteForEveryone {
                    Button(String(localized: "conversation.view.delete_for_everyone", bundle: .main), role: .destructive) {
                        Task { await viewModel.deleteMessage(messageId: msgId, mode: .everyone) }; overlayState.deleteConfirmMessageId = nil
                    }
                }
                if verdicts.canRemove {
                    ContentRemovalOffer.messageButton(before: { overlayState.deleteConfirmMessageId = nil }) { reason in
                        Task { await viewModel.removeMessage(messageId: msgId, reason: reason) }
                    }
                }
                if verdicts.canDeleteForMe {
                    Button(String(localized: "conversation.view.delete_for_me", bundle: .main), role: .destructive) {
                        Task { await viewModel.deleteMessage(messageId: msgId, mode: .local) }; overlayState.deleteConfirmMessageId = nil
                    }
                }
                Button(String(localized: "common.cancel", bundle: .main), role: .cancel) { overlayState.deleteConfirmMessageId = nil }
            } message: { _ in
                Text(String(localized: "conversation.view.delete_for_everyone.hint", bundle: .main))
            }
            // #4024 — même contrat que la confirmation ci-dessus, sur la
            // SÉLECTION entière plutôt qu'un seul message : "pour tous"
            // n'apparaît que si `selectionAllowsDeleteForAll` (TOUS les
            // messages sélectionnés sont miens, sans fenêtre — #11214).
            .confirmationDialog(
                String(localized: "conversation.view.delete_message.title", bundle: .main),
                isPresented: $overlayState.deleteConfirmSelectionActive,
                titleVisibility: .visible
            ) {
                if selectionAllowsDeleteForAll {
                    Button(String(localized: "conversation.view.delete_for_everyone", bundle: .main), role: .destructive) {
                        deleteSelectedMessages(mode: .everyone)
                    }
                }
                ContentRemovalOffer.selectionButton(selectedMessagesInThreadOrder, ids: overlayState.selectedMessageIds,
                    viewModel: viewModel, mayRemove: canRemoveMessage, onConfirmed: endSelectionMode)
                if selectionAllowsDeleteForMe {
                    Button(String(localized: "conversation.view.delete_for_me", bundle: .main), role: .destructive) {
                        deleteSelectedMessages(mode: .local)
                    }
                }
                Button(String(localized: "common.cancel", bundle: .main), role: .cancel) { }
            } message: {
                Text(String(localized: "conversation.view.delete_for_everyone.hint", bundle: .main))
            }
    }
}
