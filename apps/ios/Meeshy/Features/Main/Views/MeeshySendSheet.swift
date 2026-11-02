import SwiftUI
import MeeshySDK
import MeeshyUI

/// La feuille d'« Envoyer » (#14310) : l'écran de partage Meeshy unique, qui
/// crée le lien de l'utilisateur dès son ouverture. Présentée par la vue qui
/// porte le bouton, à une identité stable.
struct MeeshySendSheet: ViewModifier {
    @Binding var sent: SharedContentWrapper?
    var onOpenConversation: () -> Void = {}
    @Environment(\.routerCommands) private var router

    func body(content: Content) -> some View {
        content.sheet(item: $sent) { wrapper in
            ShareSheetView(
                subject: wrapper.subject,
                actions: ShareSheetHostActions(onOpenConversation: { conversation in
                    onOpenConversation()
                    router.navigateToConversation(conversation)
                }),
                onDismiss: { sent = nil }
            )
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
    }
}

extension ShareSubject {
    /// La carte d'un post ou d'un réel du fil : son auteur s'y nomme par son
    /// NOM AFFICHÉ (`FeedPost.author`, repli pseudo), comme la story et
    /// Android (#14324) — le pseudo seul y partait.
    static func publication(_ post: FeedPost, isReel: Bool? = nil) -> ShareSubject {
        .publication(id: post.id, isReel: isReel ?? post.isReel, authorName: post.author, authorId: post.authorId)
    }
}
