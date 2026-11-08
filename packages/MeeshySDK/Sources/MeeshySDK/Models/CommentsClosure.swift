import Foundation

/// **Les commentaires d'une publication sont-ils fermés, et qui peut les fermer ?**
/// (#16541)
///
/// La passerelle sert `commentsDisabled` sur chaque publication (post, réel,
/// story, statut) et sur la publication qu'elle republie (`repostOf`). Une
/// republication d'un contenu fermé est fermée elle aussi : la règle effective
/// est `post.commentsDisabled || repostOf.commentsDisabled`, la même que celle
/// qui fait refuser un commentaire (`403 COMMENTS_DISABLED`). Un serveur
/// antérieur omet le champ : son absence vaut « ouvert ».
///
/// Le droit de basculer suit la passerelle : l'auteur, ou la modération de la
/// plateforme (`PlatformRole.privileged`). La passerelle exige en plus que le
/// modérateur surclasse l'auteur — le client ne connaît pas le rôle de
/// l'auteur, il offre l'entrée et la passerelle tranche.
public enum CommentsClosure {

    /// Le code machine du refus d'un commentaire sur une publication fermée.
    public static let refusalCode = "COMMENTS_DISABLED"

    public static func isClosed(own: Bool?, source: Bool?) -> Bool {
        (own ?? false) || (source ?? false)
    }

    public static func mayToggle(authoredByViewer: Bool, platformRole: String?) -> Bool {
        authoredByViewer || ContentRemovalPolicy.isPlatformModerator(platformRole)
    }

    /// Le refus servi par la passerelle quand on commente une publication
    /// fermée : un 403 dont l'enveloppe porte `code: COMMENTS_DISABLED`.
    /// Tout autre refus (403 sans code, page d'un proxy) n'en est pas un.
    public static func isRefusal(_ error: Error) -> Bool {
        switch error {
        case MeeshyError.forbidden(_, let body):
            return APIRejection.gatewayRefusal(statusCode: 403, body: body)?.code == refusalCode
        case MeeshyError.rejected(let rejection):
            return rejection.code == refusalCode
        default:
            return false
        }
    }
}

public extension APIPost {
    /// Les commentaires de cette publication sont fermés — les siens, ou ceux
    /// de la publication qu'elle republie.
    var commentsClosed: Bool {
        CommentsClosure.isClosed(own: commentsDisabled, source: repostOf?.commentsDisabled)
    }
}

public extension FeedPost {
    /// Même règle que `APIPost.commentsClosed`, sur le modèle d'affichage.
    var commentsClosed: Bool {
        CommentsClosure.isClosed(own: commentsDisabled, source: repost?.commentsDisabled)
    }
}

public extension StoryItem {
    /// Même règle que `APIPost.commentsClosed`, sur la story du lecteur.
    var commentsClosed: Bool {
        CommentsClosure.isClosed(own: commentsDisabled, source: sourceCommentsDisabled)
    }
}
