import SwiftUI
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
