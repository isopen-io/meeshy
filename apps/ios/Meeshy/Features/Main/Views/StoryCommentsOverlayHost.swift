import SwiftUI
import MeeshySDK

// MARK: - La barre de progression n'invalide plus les commentaires (#9859)

/// **Les commentaires ouverts sur une story ne se recalculent que quand LEURS
/// données changent, jamais au tick de la barre.**
///
/// Recette du 2026-10-10 : commentaires ouverts, la story jouée en boucle sous
/// eux (#9821) coûtait 75 à 90 % du processeur, et l'app a figé une fois à
/// 100 %, le fil principal tournant dans la mise en page de la liste paresseuse
/// des commentaires (`CommentMoreMenu` dans l'échantillon). La cause : la
/// progression est un `@State` du lecteur, rafraîchie jusqu'à 60 fois par
/// seconde. Chaque tick réévaluait le lecteur, sa carte, et l'overlay des
/// commentaires — dont les fermetures (`makeStoryCommentRow`, les chasses)
/// changent d'identité à chaque passe : SwiftUI ne pouvait pas prouver que rien
/// n'avait changé, il reconstruisait chaque rangée, chaque menu « … », et
/// remesurait la `LazyVStack` à chaque image. Dès qu'une passe dépassait une
/// image, le fil principal ne rendait plus la main.
///
/// L'hôte compare ce que la liste AFFICHE — les commentaires, les fils, l'état
/// de chaque rangée — et rien d'autre. La progression n'en fait pas partie.
nonisolated struct StoryCommentsRenderInputs: Equatable {
    var comments: [FeedComment]
    var commentCount: Int
    var replies: [String: [FeedComment]]
    var expandedThreads: Set<String>
    var loadingReplies: Set<String>
    var repliesHasMore: [String: Bool]
    var isLoading: Bool
    var userLang: String
    var isStoryExpired: Bool
    var targetCommentId: String?
    var targetParentCommentId: String?
    var safeBottom: CGFloat
    var replyingToId: String?
    /// Ce que `makeStoryCommentRow` lit hors des commentaires eux-mêmes.
    var likedIds: Set<String>
    var likeDelta: [String: Int]
    var inFlightIds: Set<String>
    /// Où la liste se pose : la carte la place sur le composeur (#9893).
    var zone: StoryCommentsZone.Frame = .unplaced

    static func == (lhs: StoryCommentsRenderInputs, rhs: StoryCommentsRenderInputs) -> Bool {
        let sameComments = ArrayStorageIdentity.same(lhs.comments, rhs.comments)
            && ArrayStorageIdentity.same(lhs.replies, rhs.replies)
        let sameThreads = lhs.commentCount == rhs.commentCount
            && lhs.expandedThreads == rhs.expandedThreads
            && lhs.loadingReplies == rhs.loadingReplies
            && lhs.repliesHasMore == rhs.repliesHasMore
            && lhs.isLoading == rhs.isLoading
        let sameFrame = lhs.userLang == rhs.userLang
            && lhs.isStoryExpired == rhs.isStoryExpired
            && lhs.targetCommentId == rhs.targetCommentId
            && lhs.targetParentCommentId == rhs.targetParentCommentId
            && lhs.safeBottom == rhs.safeBottom
            && lhs.replyingToId == rhs.replyingToId
            && lhs.zone == rhs.zone
        let sameRows = lhs.likedIds == rhs.likedIds
            && lhs.likeDelta == rhs.likeDelta
            && lhs.inFlightIds == rhs.inFlightIds
        return sameComments && sameThreads && sameFrame && sameRows
    }
}

/// **Deux tableaux qui partagent le MÊME stockage sont identiques.**
///
/// `FeedComment` n'est pas `Equatable` (ses médias portent transcriptions et
/// pistes traduites) et le comparer champ à champ à chaque image coûterait ce
/// qu'on cherche à économiser. Le copy-on-write le permet : tant que l'ancien
/// rendu tient une copie, toute mutation du tableau du lecteur alloue un
/// nouveau stockage. Deux contenus égaux dans deux stockages distincts
/// comptent pour DIFFÉRENTS : un rendu de trop, jamais un rendu manqué.
nonisolated enum ArrayStorageIdentity {
    static func same<Element>(_ lhs: [Element], _ rhs: [Element]) -> Bool {
        guard lhs.count == rhs.count else { return false }
        guard !lhs.isEmpty else { return true }
        return lhs.withUnsafeBufferPointer { left in
            rhs.withUnsafeBufferPointer { right in left.baseAddress == right.baseAddress }
        }
    }

    static func same<Element>(_ lhs: [String: [Element]], _ rhs: [String: [Element]]) -> Bool {
        guard lhs.count == rhs.count else { return false }
        return lhs.allSatisfy { key, value in
            rhs[key].map { same(value, $0) } ?? false
        }
    }
}

/// L'overlay des commentaires, derrière une comparaison de ses seules
/// données : monté avec `.equatable()`, il n'est reconstruit que quand
/// `inputs` change. Ses fermetures lisent l'état du lecteur par ses `@State`,
/// donc toujours à jour, même quand l'hôte garde l'overlay d'un rendu précédent.
struct StoryCommentsOverlayHost: View, Equatable {
    var inputs: StoryCommentsRenderInputs
    let make: (StoryCommentsZone.Frame) -> StoryCommentsOverlayView

    var body: some View { make(inputs.zone) }

    /// **La carte place la liste sur son composeur** (#9893) : elle seule sait
    /// s'il est replié, déplié, soulevé par le clavier, et combien il mesure.
    /// La zone entre dans la comparaison : la liste suit chaque état.
    func placed(_ reading: StoryCommentsZone.ComposerReading) -> StoryCommentsOverlayHost {
        var placed = self
        placed.inputs.zone = reading.frame(safeBottom: inputs.safeBottom)
        return placed
    }

    static func == (lhs: StoryCommentsOverlayHost, rhs: StoryCommentsOverlayHost) -> Bool {
        lhs.inputs == rhs.inputs
    }
}

extension StoryViewerView {

    var storyCommentsRenderInputs: StoryCommentsRenderInputs {
        StoryCommentsRenderInputs(
            comments: storyComments,
            commentCount: storyCommentCount,
            replies: storyCommentRepliesMap,
            expandedThreads: storyCommentExpandedThreads,
            loadingReplies: storyCommentLoadingReplies,
            repliesHasMore: storyCommentRepliesHasMore,
            isLoading: isLoadingComments,
            userLang: AuthManager.shared.currentUser?.preferredContentLanguages.first ?? "fr",
            isStoryExpired: currentStory?.isExpired() ?? false,
            targetCommentId: targetCommentId,
            targetParentCommentId: targetParentCommentId,
            safeBottom: windowBottomInset,
            replyingToId: replyingToStoryComment?.id,
            likedIds: storyCommentLikedIds,
            likeDelta: storyCommentLikeDelta,
            inFlightIds: heartInFlightIds
        )
    }

    func storyCommentsOverlayHost() -> StoryCommentsOverlayHost {
        StoryCommentsOverlayHost(inputs: storyCommentsRenderInputs, make: { storyCommentsOverlay(zone: $0) })
    }
}
