import SwiftUI
import MeeshySDK
import MeeshyUI

// Extrait de `ProfileUserPostsList.swift` (hors budget de taille) : la porte
// d'ouverture d'un contenu tapé dans la liste d'un profil.

// MARK: - Profile posts opener (shared host-side navigation)
//
// Centralizes how a host (any sheet presenting `ProfileUserPostsList`) opens a
// tapped post or reel: dismiss the profile sheet first, then navigate at the
// root. Reels present the immersive overlay — which lives behind the sheet, so
// it must come up AFTER the dismiss settles (hence the small delay). Posts push
// the detail route via RootView's existing `pushNavigateToRoute` listener, so
// hosts without a `Router` in scope (audio fullscreen, comments sheet) work too.
@MainActor
enum ProfilePostsOpener {
    static func openReel(_ reel: FeedPost, in reels: [FeedPost], dismiss: @escaping () -> Void) {
        dismiss()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            HapticFeedback.medium()
            ReelsPresenter.shared.present(posts: reels, startId: reel.id)
        }
    }

    static func openPost(_ post: FeedPost, dismiss: @escaping () -> Void) {
        dismiss()
        NotificationCenter.default.post(
            name: Notification.Name("pushNavigateToRoute"),
            object: "postDetail:\(post.id)"
        )
    }
}

/// Ce que fait un tap d'ouverture dans la liste d'un profil (#10483) : envoyer
/// l'engagement d'ouverture, origine `profile`, puis amener le contenu à sa
/// destination. Chaque tap ouvre — aucune fenêtre ne tait une réouverture — et
/// la vue est comptée par la destination, provenance `listing` / `profile`.
struct ProfilePostOpening {
    let onOpenPost: ((FeedPost) -> Void)?
    let onOpenReel: ((_ reel: FeedPost, _ reels: [FeedPost]) -> Void)?
    var opens: ContentOpenReporting = ContentOpenReporter.shared

    func openPost(_ post: FeedPost) {
        opens.open(post.id, from: .profile)
        onOpenPost?(post)
    }

    func openReel(_ post: FeedPost, in reels: [FeedPost]) {
        opens.open(post.id, from: .profile)
        guard let onOpenReel else {
            onOpenPost?(post)
            return
        }
        onOpenReel(post, reels)
    }
}
