import SwiftUI
import MeeshySDK

// MARK: - La fiche de la conversation, et ce que son onglet Médias déclenche (#8103)

/// **Le montage de la fiche a quitté `ConversationView.body`** — l'hôte est
/// hors budget de taille, et câbler l'écran « Médias, liens et documents »
/// dans son corps était interdit avant d'en sortir quelque chose. Ce
/// modificateur emporte la feuille ET son câblage : l'hôte y perd des lignes.
///
/// Deux actions, deux SÉQUENCES — la fiche est une feuille, et SwiftUI ne
/// présente pas un plein écran par-dessus une feuille qui se referme :
/// - **toucher un média** : la fiche se ferme, PUIS la galerie de la
///   conversation (#8095) s'ouvre sur la pièce — celle du fil, qui sait
///   répondre, réagir et recomposer ;
/// - **aller au message** : la fiche se ferme et le surlignage SCOPÉ du
///   routeur prend le relais — `ConversationView` le consomme par son chemin
///   unique (défilement si chargé, sinon fenêtre `around`).
struct ConversationInfoSheetLayer: ViewModifier {
    @Binding var isPresented: Bool
    @Binding var scrollState: ConversationScrollState
    let conversation: Conversation?
    let accentColor: String
    let messages: [Message]
    let router: Router
    let onConversationUpdated: (Conversation) -> Void

    @State private var pendingGallery: MessageAttachment?

    func body(content: Content) -> some View {
        content.sheet(isPresented: $isPresented, onDismiss: presentPendingGallery) {
            if let conversation {
                ConversationInfoSheet(
                    conversation: conversation,
                    accentColor: accentColor,
                    messages: messages,
                    mediaHubActions: actions(for: conversation),
                    onConversationUpdated: onConversationUpdated
                )
            }
        }
    }

    private func actions(for conversation: Conversation) -> ConversationMediaHubActions {
        ConversationMediaHubActions(
            openVisual: { attachment in
                pendingGallery = attachment
                isPresented = false
            },
            goToMessage: { messageId in
                router.pendingHighlightConversationId = conversation.id
                router.pendingHighlightMessageId = messageId
                isPresented = false
            }
        )
    }

    private func presentPendingGallery() {
        guard let attachment = pendingGallery else { return }
        pendingGallery = nil
        scrollState.galleryStartAttachment = attachment
    }
}
