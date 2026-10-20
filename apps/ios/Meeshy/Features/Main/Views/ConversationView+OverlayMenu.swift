import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Le menu d'appui long d'un message
//
// Extrait de `ConversationView.swift` (cohésion). L'hôte garde ce qui dépend
// de SON état — le message visé, sa frame suivie par `frameTracker`, la
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
    let isAdminOrMod: Bool
    let mediaSaveCoordinator: MediaSaveCoordinator
    let actions: ConversationMessageActions

    var body: some View {
        MessageOverlayMenu(
            message: msg,
            contactColor: accentColor,
            // Le frame-tracker ne suit que les BULLES : en Focal/Script il
            // rend `nil`, donc `.zero`, et l'overlay présente son aperçu
            // centré, à sa taille naturelle. C'est exactement ce que
            // demande la directive du 2026-08-23 — « le mode focal, en
            // long-press, doit afficher le message normal » — là où la
            // capture de la cellule Focal en tranchait l'identité et la
            // barre de méta, toutes deux à cheval sur son cadre.
            messageBubbleFrame: bubbleFrame,
            isPresented: $overlayState.showOverlayMenu,
            canDelete: msg.isMe || isAdminOrMod || actions.canRemove(msg),
            canEdit: msg.isMe || isAdminOrMod,
            onCopy: {
                // Prisme: copy what's DISPLAYED (the preferred translation when
                // one is showing), never the original — like the quick bar's Copier.
                guard MessageExitTransport.copy(viewModel.preferredTranslation(for: msg.id)?.translatedContent ?? msg.content, of: msg) else { return }
                HapticFeedback.success()
            },
            onEdit: { actions.edit(msg) },
            isStarred: viewModel.isStarred(messageId: msg.id),
            textTranslations: viewModel.messageTranslations[msg.id] ?? [],
            transcription: viewModel.messageTranscriptions[msg.id],
            translatedAudios: viewModel.messageTranslatedAudios[msg.id] ?? [],
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
            isDirect: isDirect,
            preferredTranslation: viewModel.preferredTranslation(for: msg.id),
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
            }
        )
    }
}
