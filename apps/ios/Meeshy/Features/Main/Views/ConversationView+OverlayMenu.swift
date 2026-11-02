import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Le menu d'appui long d'un message
//
// Extrait de `ConversationView.swift` (cohésion). L'hôte garde ce qui dépend
// de SON état — le message visé, le cadre de sa cellule, la
// langue du fil, l'aiguillage vers l'aperçu d'une pièce — et remet le reste ;
// ce type compose le menu et branche ses rappels sur le ViewModel, l'état des
// surcouches et les gestes de `ConversationMessageActions`.

struct ConversationOverlayMenu: View {
    let viewModel: ConversationViewModel
    @Binding var overlayState: ConversationOverlayState
    let msg: Message
    let accentColor: String
    let bubbleFrame: CGRect
    let threadLanguage: MessageOverlayMenu.ThreadLanguage
    let isDirect: Bool
    let authority: ConversationMenuAuthority
    let mediaSaveCoordinator: MediaSaveCoordinator
    let actions: ConversationMessageActions

    var body: some View { overlay }

    /// Le menu tel que l'hôte le monte, rappels compris : les témoins lisent
    /// ce qui est CÂBLÉ ici, pas une liste recomposée à part (#12625).
    var overlay: MessageOverlayMenu {
        MessageOverlayMenu(
            message: msg,
            contactColor: accentColor,
            // Le cadre de la cellule pressée (`overlaySourceFrame`, résolu
            // par `cellFrameInWindow`) : l'aperçu s'ouvre À SA PLACE, dans le
            // mode de lecture du fil — la rangée plate en Script et en Focal,
            // la bulle ailleurs (`MessageOverlayPreviewKind`). La décision
            // #11204 supplante la directive du 2026-08-23 (« en Focal, afficher
            // le message normal ») : son grief était la CAPTURE de la cellule,
            // qui tranchait l'identité et la méta posées à cheval sur son
            // cadre. L'aperçu ne capture plus rien, il rend la rangée elle-même,
            // entière, à 16 pt des bords.
            messageBubbleFrame: bubbleFrame,
            isPresented: $overlayState.showOverlayMenu,
            // #11214 — la fabrique unique : les verdicts de la loi partagée.
            menuContext: MessageMenuContext.make(message: msg, viewModel: viewModel, authority: authority),
            onCopy: {
                // Prisme : copie ce que la bulle AFFICHE, drapeau basculé compris (#11233).
                guard MessageExitTransport.copyDisplayed(msg, in: viewModel) else { return }
                HapticFeedback.success()
            },
            onEdit: { actions.beginEdit(msg) },
            onReply: { actions.reply(msg) },
            onRetry: { Task { await viewModel.retryMessage(messageId: msg.id) } },
            textTranslations: UnencryptedMessageGate.translations(of: msg, in: viewModel),
            transcription: viewModel.messageTranscriptions[msg.id],
            translatedAudios: UnencryptedMessageGate.translatedAudios(of: msg, in: viewModel),
            threadLanguage: threadLanguage,
            onReact: { emoji in
                viewModel.toggleReaction(messageId: msg.id, emoji: emoji)
            },
            onSaveMedia: {
                // Composant unifié « Enregistrer » — l'action n'apparaît
                // que pour un message à exactement UN attachment.
                if MessageExitTransport.save(msg, through: mediaSaveCoordinator) { HapticFeedback.light() }
            },
            onCompose: {
                // L'overlay ne monte rien : il rend la main. Le même état
                // que le second déclencheur, un seul chemin de présentation.
                actions.compose(msg)
            },
            onSelect: { actions.beginSelection(msg.id) },
            // « Supprimer » à un geste (#12625) : `requestDeleteMessage`
            // abandonne un envoi raté tout de suite et ouvre, sinon, la
            // confirmation des verdicts (pour tous / retirer / pour moi).
            onDelete: { actions.requestDelete(msg.id) },
            isDirect: isDirect,
            preferredTranslation: UnencryptedMessageGate.preferredTranslation(of: msg, in: viewModel),
            mentionDisplayNames: viewModel.mentionDisplayNames,
            currentUserId: AuthManager.shared.currentUser?.id ?? "",
            userRegionalLanguage: AuthManager.shared.currentUser?.regionalLanguage,
            userCustomDestinationLanguage: AuthManager.shared.currentUser?.customDestinationLanguage,
            onShowTranslate: {
                overlayState.moreSheetInitialItem = .language
                overlayState.detailSheetMessage = msg
            },
            onShowMore: {
                overlayState.moreSheetInitialItem = nil
                overlayState.detailSheetMessage = msg
            },
            onShowCallDetail: {
                overlayState.callDetailMessage = msg
            },
            onExportImage: { quick in actions.export(msg, quick) },
            onExpandFullPicker: {
                overlayState.fullReactionPickerMessage = msg
            },
            isUnencrypted: UnencryptedMessageGate.isUnencrypted(msg, in: viewModel),
            // #11339 — un vocal lu depuis l'aperçu : la même entrée de file
            // que le fil, sans auto-avance derrière lui.
            onPlayAudio: { attachmentId in
                viewModel.playAudio(attachmentId: attachmentId, continuesQueue: false)
            }
        )
    }
}
