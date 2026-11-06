import Foundation
import MeeshySDK

/// Une entrée du menu « … » d'un commentaire, dans l'ordre où le menu la montre.
enum CommentMenuAction: Hashable {
    case copy
    case edit
    case report
    case delete
    /// #11151 — la modération retire le commentaire d'un autre, avec un motif.
    case remove
}

/// **Quelles actions pour ce commentaire et ce lecteur** (#8709).
///
/// Directive porteur 2026-09-29 : « si on est auteur, pouvoir éditer ; signaler
/// pour les autres ; copier ». La ligne d'un commentaire de post
/// (`CommentRowView`) et celle d'un commentaire de story
/// (`StoryCommentRowView`) lisent la MÊME loi, par `CommentMoreMenu`.
///
/// « Imager » n'y est plus (#16541) : il vit dans la rangée d'actions de la
/// ligne, en icône seule (`CommentImagerButton`) — une action, un chemin.
///
/// Un commentaire protégé (flouté, vue unique, éphémère) ne se copie jamais :
/// ce qui ne se montre pas en clair ne part pas dans le presse-papiers.
enum CommentMenuPolicy {

    static func isAuthor(_ comment: FeedComment, viewerId: String?) -> Bool {
        guard let viewerId, !viewerId.isEmpty else { return false }
        return comment.authorId == viewerId
    }

    static func isProtected(_ comment: FeedComment) -> Bool {
        comment.effects.flags.hasLifecycleEffect
    }

    /// - Parameters:
    ///   - servedText: le texte que la ligne affiche (Prisme, ou l'original demandé par la puce).
    ///   - editable: l'hôte sait éditer un commentaire.
    ///   - deletable: l'hôte sait supprimer un commentaire.
    ///   - removable: l'hôte sait retirer le commentaire d'un autre (modération, #11151).
    static func actions(
        for comment: FeedComment,
        viewerId: String?,
        servedText: String,
        editable: Bool,
        deletable: Bool,
        removable: Bool = false
    ) -> [CommentMenuAction] {
        let mine = isAuthor(comment, viewerId: viewerId)
        let known = !(viewerId ?? "").isEmpty
        let copyable = !isProtected(comment)
            && !servedText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let offered: [(CommentMenuAction, Bool)] = [
            (.copy, copyable),
            (.edit, mine && editable),
            (.report, known && !mine),
            (.delete, mine && deletable),
            (.remove, known && !mine && removable),
        ]
        return offered.filter(\.1).map(\.0)
    }
}
