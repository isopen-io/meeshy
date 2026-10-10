import Foundation
import MeeshySDK

public extension PostCommentCardSource {

    /// **La source d'une carte de commentaire, ses textes LUS comme le fil les
    /// montre** (#9686) — le post et chaque commentaire passent par
    /// `MessageTextRenderer.plainText`, la règle même de l'aperçu : « [notre
    /// page](https://…) » se lit « notre page », « [[https://…]] » se lit
    /// « https://… ». Aucune seconde règle : la carte et le fil disent la même chose.
    static func reading(post: FeedPost?, target: FeedComment, thread: [FeedComment],
                        viewer: MessageCardSubject.Viewer, showOriginal: Bool = false) -> PostCommentCardSource {
        let comments = thread + [target]
        let raws = (post.map { [$0.displayContent] } ?? []) + comments.flatMap { [$0.displayContent, $0.content] }
        let readable = Dictionary(raws.map { ($0, MessageTextRenderer.plainText($0)) }, uniquingKeysWith: { first, _ in first })
        return PostCommentCardSource(post: post, target: target, thread: thread, viewer: viewer,
                                     showOriginal: showOriginal, readable: readable)
    }
}
