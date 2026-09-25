import Foundation
import MeeshySDK

/// **Les participants d'un contexte de publication** (#7847) — ceux que la
/// liste `@` sert juste APRÈS les contacts : l'auteur du post, puis ceux qui
/// l'ont commenté, dans l'ordre de la discussion.
///
/// Une personne sans pseudo connu ne peut pas être insérée (`@username `),
/// elle n'est donc pas proposée. Les doublons et soi-même sont retirés plus
/// loin, par `MentionSuggestionRule` — une seule règle, pas deux.
enum MentionParticipants {

    static func of(post: FeedPost?, comments: [FeedComment]) -> [MentionCandidate] {
        let author = post.flatMap { post in
            post.authorUsername.map {
                MentionCandidate(id: post.authorId, username: $0,
                                 displayName: post.author, avatarURL: post.authorAvatarURL)
            }
        }
        let commenters = comments.compactMap { comment in
            comment.authorUsername.map {
                MentionCandidate(id: comment.authorId, username: $0,
                                 displayName: comment.author, avatarURL: comment.authorAvatarURL)
            }
        }
        return [author].compactMap { $0 } + commenters
    }
}
