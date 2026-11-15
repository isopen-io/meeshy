import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Fermer / rouvrir les commentaires d'une publication** (#16541) — le geste
/// du menu ⋯ d'un post, d'un réel et d'une story, une seule fois pour toutes
/// les surfaces.
///
/// Optimiste : l'hôte voit le nouvel état tout de suite (`apply`), la
/// passerelle confirme, et l'état ÉCRIT par elle fait foi. Un refus remet
/// l'état d'avant et le dit.
@MainActor
enum CommentSettingsToggle {

    /// L'entrée s'offre à l'auteur et à la modération de la plateforme
    /// (`CommentsClosure.mayToggle`). Sans compte, jamais.
    static func isOffered(
        authorId: String,
        viewerId: String? = AuthManager.shared.currentUser?.id,
        viewerRole: String? = AuthManager.shared.currentUser?.role
    ) -> Bool {
        guard let viewerId, !viewerId.isEmpty else { return false }
        return CommentsClosure.mayToggle(authoredByViewer: viewerId == authorId, platformRole: viewerRole)
    }

    /// Bascule `current` → `!current`. Rend l'état final, celui que l'hôte
    /// affiche après l'appel.
    @discardableResult
    static func run(
        postId: String,
        current: Bool,
        service: PostServiceProviding,
        apply: (Bool) -> Void
    ) async -> Bool {
        let target = !current
        apply(target)
        do {
            let written = try await service.setCommentsDisabled(postId: postId, disabled: target)
            apply(written)
            FeedbackToastManager.shared.showSuccess(written ? Copy.disabledDone : Copy.enabledDone)
            return written
        } catch {
            apply(current)
            FeedbackToastManager.shared.showError(Copy.failure)
            return current
        }
    }

    nonisolated enum Copy {
        static var disable: String {
            String(localized: "comments.settings.disable", defaultValue: "Désactiver les commentaires", bundle: .main)
        }
        static var enable: String {
            String(localized: "comments.settings.enable", defaultValue: "Réactiver les commentaires", bundle: .main)
        }
        static var disabledDone: String {
            String(localized: "comments.settings.disabled", defaultValue: "Commentaires désactivés", bundle: .main)
        }
        static var enabledDone: String {
            String(localized: "comments.settings.enabled", defaultValue: "Commentaires réactivés", bundle: .main)
        }
        static var failure: String {
            String(localized: "comments.settings.error", defaultValue: "Impossible de modifier les commentaires", bundle: .main)
        }

        static func label(closed: Bool) -> String { closed ? enable : disable }

        static func symbol(closed: Bool) -> String {
            closed ? "bubble.left.and.bubble.right" : "bubble.left.and.exclamationmark.bubble.right"
        }
    }
}

/// L'entrée du menu ⋯ : « Désactiver les commentaires » / « Réactiver les
/// commentaires ». L'hôte ne la monte que si `CommentSettingsToggle.isOffered`.
struct CommentSettingsMenuItem: View {
    /// Le drapeau PROPRE de la publication — celui que l'entrée bascule.
    let commentsDisabled: Bool
    let onToggle: () -> Void

    var body: some View {
        Button {
            HapticFeedback.light()
            onToggle()
        } label: {
            Label(CommentSettingsToggle.Copy.label(closed: commentsDisabled),
                  systemImage: CommentSettingsToggle.Copy.symbol(closed: commentsDisabled))
        }
        .accessibilityIdentifier("post.comments.settings")
    }
}

extension CommentSettingsMenuItem {
    /// L'entrée, quand elle s'offre pour `post` — rien sinon.
    @MainActor @ViewBuilder
    static func offered(for post: FeedPost?, onToggle: @escaping () -> Void) -> some View {
        if let post, CommentSettingsToggle.isOffered(authorId: post.authorId) {
            CommentSettingsMenuItem(commentsDisabled: post.commentsDisabled, onToggle: onToggle)
        }
    }
}

extension CommentSettingsToggle {
    /// Le geste sur un post du FIL — le fil garde sa liste et son cache.
    static func toggle(_ postId: String, in feed: FeedViewModel) async {
        guard let current = feed.posts.first(where: { $0.id == postId })?.commentsDisabled else { return }
        await run(postId: postId, current: current, service: feed.postService) { closed in
            guard let index = feed.posts.firstIndex(where: { $0.id == postId }) else { return }
            feed.posts[index].commentsDisabled = closed
            feed.debouncedCacheSave()
        }
    }

    /// L'action d'un hôte du fil, `nil` quand l'entrée ne s'offre pas.
    static func feedAction(for post: FeedPost, in feed: FeedViewModel) -> ((String) -> Void)? {
        guard isOffered(authorId: post.authorId) else { return nil }
        return { postId in Task { await toggle(postId, in: feed) } }
    }
}

/// L'action « Désactiver / Réactiver les commentaires » remise par l'hôte d'une
/// carte de post (#16541) — `nil` par défaut : l'entrée ne s'offre pas. Par
/// l'environnement, la carte n'a ni champ ni comparaison de plus à porter.
private struct CommentSettingsActionKey: EnvironmentKey {
    static let defaultValue: ((String) -> Void)? = nil
}

extension EnvironmentValues {
    var commentSettingsAction: ((String) -> Void)? {
        get { self[CommentSettingsActionKey.self] }
        set { self[CommentSettingsActionKey.self] = newValue }
    }
}
