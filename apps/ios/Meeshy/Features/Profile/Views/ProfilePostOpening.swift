import SwiftUI
import MeeshySDK
import MeeshyUI

// Extrait de `ProfileUserPostsList.swift` (hors budget de taille) : la porte
// d'ouverture d'un contenu tapé dans la liste d'un profil.

// MARK: - Profile posts opener (shared host-side navigation)
//
// Centralizes how a host (any sheet presenting `ProfileUserPostsList`) opens a
// tapped post or reel: the profile sheet leaves first, then the content opens
// at the root. `postsContent` hands the list its way out (`leavingHost`) and
// the list opens the content itself once its sheet has LEFT
// (`ProfileSheetDeparture`) — through the Router for a post, the immersive
// viewer for a reel. Hosts that build the list themselves hand it the same way
// out (`leavingHost`) and let it open the reel at the sheet's departure (#18690).
@MainActor
enum ProfilePostsOpener {
    static func postsContent(dismiss: @escaping () -> Void) -> (String) -> AnyView {
        { uid in AnyView(ProfileUserPostsList(userId: uid, leavingHost: dismiss)) }
    }
}

/// **Ce qui attend que la feuille de profil soit partie** (#18590). Une
/// feuille présentée pendant que la fiche descend encore est avalée ; on
/// attendait donc un temps fixe. La fiche referme désormais, et l'ouverture
/// part à la DISPARITION de la liste — ni trop tôt sur un appareil lent, ni
/// pour rien sur un appareil rapide. Une seule ouverture attend à la fois.
@MainActor
final class ProfileSheetDeparture {
    nonisolated deinit {}

    private var waiting: (@MainActor () -> Void)?

    func leave(dismissing dismiss: () -> Void, then open: @escaping @MainActor () -> Void) {
        waiting = open
        dismiss()
    }

    func sheetDidLeave() {
        guard let open = waiting else { return }
        waiting = nil
        open()
    }
}

/// **L'auteur touché sur une carte de la liste d'un profil** (#18590) : celui
/// d'un réel republié ouvre SA fiche, à la place de celle-ci ; l'auteur de la
/// liste elle-même n'ouvre rien — sa fiche est déjà là.
enum ProfileAuthorTap {
    static func profile(of authorId: String, in post: FeedPost, listedUserId: String) -> ProfileSheetUser? {
        guard !authorId.isEmpty, authorId != listedUserId else { return nil }
        let username = post.repost?.authorId == authorId ? post.repost?.authorUsername : post.authorUsername
        return ProfileSheetUser(userId: authorId, username: username ?? authorId)
    }

    /// Le toucher de l'auteur d'une carte (#18690) : `nil` quand l'auteur AFFICHÉ est celui
    /// de la liste — la carte ne dessine alors aucun bouton.
    static func action(for post: FeedPost, listedUserId: String,
                       open: @escaping (ProfileSheetUser) -> Void) -> ((String) -> Void)? {
        guard profile(of: ReelAuthorAttribution.authorId(of: post), in: post, listedUserId: listedUserId) != nil else { return nil }
        return { authorId in
            guard let author = profile(of: authorId, in: post, listedUserId: listedUserId) else { return }
            open(author)
        }
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
