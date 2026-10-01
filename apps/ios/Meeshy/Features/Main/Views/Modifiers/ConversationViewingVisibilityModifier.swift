import SwiftUI

/// « Est dans la conversation » (#9052) : l'écran de la conversation rapporte
/// sa VISIBILITÉ. `onDisappear` part quand une couverture plein écran
/// (galerie, visionneuse, story, caméra) ou un écran poussé le masque ; le pair
/// voit alors le point « ici » s'éteindre, et se rallumer au retour.
///
/// Posé chez les hôtes de navigation, jamais sur l'aperçu au long-press : un
/// aperçu ne fait pas entrer dans la conversation.
struct ConversationViewingVisibilityModifier: ViewModifier {
    let conversationId: String

    func body(content: Content) -> some View {
        content
            .onAppear { ConversationViewingReporter.shared.screenAppeared(conversationId) }
            .onDisappear { ConversationViewingReporter.shared.screenDisappeared(conversationId) }
    }
}

extension View {
    func reportsConversationViewing(_ conversationId: String) -> some View {
        modifier(ConversationViewingVisibilityModifier(conversationId: conversationId))
    }
}
