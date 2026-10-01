import SwiftUI

/// « Est dans la conversation » (#9052) : l'écran de la conversation rapporte
/// sa VISIBILITÉ. `onDisappear` part quand un écran poussé le masque ; le pair
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

/// Un plein écran présenté DEPUIS la conversation (galerie, visionneuse,
/// story, caméra, éditeurs) la couvre tant qu'il est monté. Le contenu
/// présenté porte le marqueur, pas l'écran couvert : un `fullScreenCover` ne
/// déclenche ni `onDisappear`, ni sortie de fenêtre, ni rappel UIKit sur
/// l'écran qu'il recouvre (mesuré au simulateur iOS 26) — seul le contenu
/// présenté sait qu'il est là.
struct ConversationViewingCoverModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .onAppear { ConversationViewingReporter.shared.coverBegan() }
            .onDisappear { ConversationViewingReporter.shared.coverEnded() }
    }
}

extension View {
    func reportsConversationViewing(_ conversationId: String) -> some View {
        modifier(ConversationViewingVisibilityModifier(conversationId: conversationId))
    }

    func coversConversationViewing() -> some View {
        modifier(ConversationViewingCoverModifier())
    }
}

extension View {
    /// Le `fullScreenCover` de la conversation : son contenu la couvre.
    func conversationCover<Content: View>(
        isPresented: Binding<Bool>,
        onDismiss: (() -> Void)? = nil,
        @ViewBuilder content: @escaping () -> Content
    ) -> some View {
        fullScreenCover(isPresented: isPresented, onDismiss: onDismiss) {
            content().coversConversationViewing()
        }
    }

    func conversationCover<Item: Identifiable, Content: View>(
        item: Binding<Item?>,
        onDismiss: (() -> Void)? = nil,
        @ViewBuilder content: @escaping (Item) -> Content
    ) -> some View {
        fullScreenCover(item: item, onDismiss: onDismiss) { presented in
            content(presented).coversConversationViewing()
        }
    }
}
