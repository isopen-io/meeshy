import Foundation
import MeeshySDK

/// Une entrée du menu « … » d'un commentaire, dans l'ordre où le menu la montre.
enum CommentMenuAction: Hashable {
    case copy
    case imagine
    case edit
    case report
    case delete
}

/// **Quelles actions pour ce commentaire et ce lecteur** (#8709).
///
/// Directive porteur 2026-09-29 : « si on est auteur, pouvoir éditer ; signaler
/// pour les autres ; copier ; et Imager avec l'arbre de réponse ». La ligne d'un
/// commentaire de post (`CommentRowView`) et celle d'un commentaire de story
/// (`StoryCommentRowView`) lisent la MÊME loi, par `CommentMoreMenu`.
///
/// Un commentaire protégé (flouté, vue unique, éphémère) ne se copie jamais :
/// ce qui ne se montre pas en clair ne part pas dans le presse-papiers. Imager
/// suit la loi de la carte (`MessageCardSubject.of(comment:)`), qui le refuse
/// de même — l'hôte en passe le verdict par `canImagine`.
enum CommentMenuPolicy {

    /// Au-delà, un sous-menu cesse d'être un choix et devient une liste à lire.
    static let imagineRepliesLimit = 5

    static func isAuthor(_ comment: FeedComment, viewerId: String?) -> Bool {
        guard let viewerId, !viewerId.isEmpty else { return false }
        return comment.authorId == viewerId
    }

    static func isProtected(_ comment: FeedComment) -> Bool {
        comment.effects.flags.hasLifecycleEffect
    }

    /// - Parameters:
    ///   - servedText: le texte que la ligne affiche (Prisme, ou l'original demandé par la puce).
    ///   - canImagine: la carte d'export existe pour ce commentaire.
    ///   - editable: l'hôte sait éditer un commentaire.
    ///   - deletable: l'hôte sait supprimer un commentaire.
    static func actions(
        for comment: FeedComment,
        viewerId: String?,
        servedText: String,
        canImagine: Bool,
        editable: Bool,
        deletable: Bool
    ) -> [CommentMenuAction] {
        let mine = isAuthor(comment, viewerId: viewerId)
        let known = !(viewerId ?? "").isEmpty
        let copyable = !isProtected(comment)
            && !servedText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let offered: [(CommentMenuAction, Bool)] = [
            (.copy, copyable),
            (.imagine, canImagine),
            (.edit, mine && editable),
            (.report, known && !mine),
            (.delete, mine && deletable),
        ]
        return offered.filter(\.1).map(\.0)
    }

    /// **L'arbre de réponses d'une racine** : les réponses chargées qu'« Imager »
    /// peut emporter avec elle — celles que la loi de la carte accepte (ni
    /// protégées, ni vides), au plus `imagineRepliesLimit`. Une réponse n'en
    /// offre aucune : c'est elle qui emporte sa racine en citation.
    static func imagineReplies(for comment: FeedComment, loaded replies: [FeedComment]) -> [FeedComment] {
        guard comment.parentId == nil, !isProtected(comment) else { return [] }
        let anyone = MessageCardSubject.Viewer(id: "", displayName: nil)
        let paintable = replies.filter { MessageCardSubject.of(comment: $0, viewer: anyone) != nil }
        return Array(paintable.prefix(imagineRepliesLimit))
    }
}
