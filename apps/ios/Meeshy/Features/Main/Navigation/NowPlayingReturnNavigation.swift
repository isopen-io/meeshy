import SwiftUI
import UIKit

/// Retour depuis la carte Now Playing (lock screen / Control Center) : iOS
/// n'émet AUCUN signal dédié quand l'utilisateur tape la carte — il ouvre
/// simplement l'app. Le signal exploitable est donc « retour au premier plan
/// après un VRAI passage en arrière-plan, pendant qu'un audio de conversation
/// JOUE » : dans ce cas on ramène l'utilisateur vers la conversation et le
/// message audio concernés, via le même chemin que le tap-notification
/// (`.meeshyNavigateToConversation` + highlight scopé).
nonisolated enum NowPlayingReturnPolicy {

    struct Target: Equatable {
        let conversationId: String
        let messageId: String
    }

    /// Décision pure. `nil` = ne pas naviguer :
    /// - lecture à l'arrêt ou en pause (une file en pause peut traîner des
    ///   heures — chaque ouverture de l'app ne doit pas être détournée) ;
    /// - pas de contexte actif ;
    /// - id porteur qui n'est pas une conversation connue (l'audio d'un post
    ///   ou d'un commentaire voyage avec l'id du post — pas de navigation).
    static func target(
        context: ActiveAudioContext?,
        isPlaying: Bool,
        isKnownConversation: (String) -> Bool
    ) -> Target? {
        guard isPlaying, let context else { return nil }
        guard isKnownConversation(context.conversationId) else { return nil }
        return Target(conversationId: context.conversationId, messageId: context.messageId)
    }
}

/// Modificateur posé sur la racine (iPhone ET iPad) : suit le cycle
/// background → active de l'app et déclenche la navigation quand la politique
/// le décide. Le highlight est parké sur le Router AVANT le post — même
/// séquence que `StarredMessagesView.navigate(to:)`, consommée par les
/// handlers `.meeshyNavigateToConversation` existants des deux roots.
struct NowPlayingReturnNavigationModifier: ViewModifier {
    let router: Router
    let isKnownConversation: (String) -> Bool

    @State private var wasBackgrounded = false

    func body(content: Content) -> some View {
        content
            .onReceive(NotificationCenter.default.publisher(
                for: UIApplication.didEnterBackgroundNotification)) { _ in
                wasBackgrounded = true
            }
            .onReceive(NotificationCenter.default.publisher(
                for: UIApplication.didBecomeActiveNotification)) { _ in
                // Un passage .inactive → .active (Control Center ouvert SUR
                // l'app, bannière, Face ID) ne doit pas naviguer : seul un
                // retour depuis un vrai background compte.
                guard wasBackgrounded else { return }
                wasBackgrounded = false
                let coordinator = ConversationAudioCoordinator.shared
                guard let target = NowPlayingReturnPolicy.target(
                    context: coordinator.activeContext,
                    isPlaying: coordinator.isPlaying,
                    isKnownConversation: isKnownConversation
                ) else { return }
                router.pendingHighlightMessageId = target.messageId
                router.pendingHighlightConversationId = target.conversationId
                NotificationCenter.default.post(
                    name: .meeshyNavigateToConversation,
                    object: target.conversationId
                )
            }
    }
}

extension View {
    /// À poser sur la vue racine, là où le handler
    /// `.meeshyNavigateToConversation` est déjà branché.
    func nowPlayingReturnNavigation(
        router: Router,
        isKnownConversation: @escaping (String) -> Bool
    ) -> some View {
        modifier(NowPlayingReturnNavigationModifier(
            router: router,
            isKnownConversation: isKnownConversation
        ))
    }
}
