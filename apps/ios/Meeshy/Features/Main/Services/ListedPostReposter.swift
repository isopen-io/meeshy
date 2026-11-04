import Foundation
import MeeshySDK

/// **Ce que fait « Repartager » sur une carte d'une LISTE** (favoris, hashtag —
/// #15934) : envoyer par l'écrivain unique, puis le dire.
///
/// Le modèle garde ce que lui seul possède — sa liste, sa bascule optimiste
/// (`PostRepostMutation`), son cache. Ce type porte le reste, qui ne diffère
/// pas d'une liste à l'autre : la cible (racine au format de la carte), le
/// verrou en vol et la file hors ligne (`RepostPublisher`), et le retour à
/// l'utilisateur (`FeedbackToastSurfacing`). Injecté, il laisse un double de
/// test observer l'envoi et les toasts sans toucher aux singletons.
@MainActor
struct ListedPostReposter {
    private let publisher: RepostPublisher
    private let toasts: FeedbackToastSurfacing

    init(publisher: RepostPublisher = .shared, toasts: FeedbackToastSurfacing = FeedbackToastManager.shared) {
        self.publisher = publisher
        self.toasts = toasts
    }

    /// Repartage `post` tel que la liste le montre.
    /// - Returns: `false` quand l'envoi a échoué — la carte doit revenir en
    ///   arrière. Une ligne mise en file hors ligne compte pour un succès :
    ///   elle partira au retour du réseau.
    func repost(_ post: FeedPost) async -> Bool {
        do {
            try await publisher.publish(PostRepostMutation.intent(for: post))
            toasts.showSuccess(String(localized: "profile.posts.repost.success", defaultValue: "Repartagé", bundle: .main))
            return true
        } catch {
            toasts.showError(String(localized: "feed.repost.error", defaultValue: "Erreur lors du repost", bundle: .main))
            return false
        }
    }
}
