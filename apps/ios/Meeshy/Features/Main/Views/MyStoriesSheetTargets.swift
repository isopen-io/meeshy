import Foundation
import MeeshySDK
import MeeshyUI

// MARK: - Comments sheet resolution

/// Résolution cache-first du `FeedPost` derrière une story pour la sheet de
/// commentaires (`CommentsSheetView`, celle des posts). Une story fraîchement
/// listée dans « Mes stories » est déjà dans `StoryService.cachedPost` —
/// inutile de payer un aller-retour réseau pour ouvrir ses commentaires.
/// Générique : garde pure, aucune dépendance sur `APIPost` pour rester
/// testable sans construire le modèle SDK complet.
enum MyStoriesCommentsResolver {
    static func shouldUseCache<T>(cachedPost: T?) -> Bool {
        cachedPost != nil
    }
}

// MARK: - Audience target

/// Story + mode en attente d'une sélection d'utilisateurs (`EXCEPT` / `ONLY`).
struct AudienceTarget: Identifiable {
    let story: StoryItem
    let mode: PostVisibility
    var id: String { "\(story.id)-\(mode.rawValue)" }
}

// MARK: - Comments target

/// `FeedPost` résolu pour la sheet de commentaires d'une story.
struct MyStoriesCommentTarget: Identifiable {
    let post: FeedPost
    var id: String { post.id }
}
