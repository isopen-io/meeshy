import Foundation

/// Ce qu'une personne de la liste des vues a fait sur UN contenu — story, post
/// ou réel (#9727). Servi à l'AUTEUR seul (et ADMIN/BIGBOSS) par
/// `GET /posts/:postId/interactions`, à côté de l'identité de la ligne.
///
/// Miroir de `PostViewerEngagement` (`packages/shared/types/publication-viewers.ts`).
/// Chaque champ est ABSENT du fil quand il vaut zéro : il se décode à zéro, et
/// `marks` ne produit jamais « 0 commentaire ». Un serveur d'avant #9727 ne
/// sert que `reaction` (la plus récente) : elle devient la seule réaction.
///
/// Le FAVORI n'y figure jamais (décision porteur 2026-10-09) : mettre un
/// contenu de côté reste un geste privé. Une passerelle plus ancienne qui
/// servirait encore `bookmarked` voit la clé ignorée au décodage.
public struct PostViewerEngagement: Decodable, Equatable, Hashable, Sendable {
    public let reactions: [String]
    public let shareCount: Int
    public let repostCount: Int
    public let commentCount: Int
    public let replyCount: Int

    public init(
        reactions: [String] = [],
        shareCount: Int = 0,
        repostCount: Int = 0,
        commentCount: Int = 0,
        replyCount: Int = 0
    ) {
        self.reactions = reactions
        self.shareCount = shareCount
        self.repostCount = repostCount
        self.commentCount = commentCount
        self.replyCount = replyCount
    }

    private enum CodingKeys: String, CodingKey {
        case reaction, reactions, shareCount, repostCount, commentCount, replyCount
    }

    /// Se décode depuis la LIGNE de la liste elle-même (mêmes clés que
    /// l'identité) : tolérant à chaque champ absent ou mal formé — une marque
    /// qui manque ne doit jamais faire tomber la liste.
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let served = try? container.decodeIfPresent([String].self, forKey: .reactions)
        let legacy = try? container.decodeIfPresent(String.self, forKey: .reaction)
        reactions = served.flatMap { $0.isEmpty ? nil : $0 } ?? legacy.map { [$0] } ?? []
        shareCount = Self.count(container, .shareCount)
        repostCount = Self.count(container, .repostCount)
        commentCount = Self.count(container, .commentCount)
        replyCount = Self.count(container, .replyCount)
    }

    private static func count(_ container: KeyedDecodingContainer<CodingKeys>, _ key: CodingKeys) -> Int {
        max(0, (try? container.decodeIfPresent(Int.self, forKey: key)) ?? 0)
    }

    /// Une marque à dessiner, dans l'ordre de la feuille : réactions,
    /// commentaires, réponses, republications, partages.
    public enum Mark: Equatable, Hashable, Sendable {
        case reactions([String])
        case comments(Int)
        case replies(Int)
        case reposts(Int)
        case shares(Int)
    }

    /// Les marques non nulles — un compteur à zéro n'en produit aucune.
    public var marks: [Mark] {
        var result: [Mark] = []
        if !reactions.isEmpty { result.append(.reactions(reactions)) }
        if commentCount > 0 { result.append(.comments(commentCount)) }
        if replyCount > 0 { result.append(.replies(replyCount)) }
        if repostCount > 0 { result.append(.reposts(repostCount)) }
        if shareCount > 0 { result.append(.shares(shareCount)) }
        return result
    }

    /// La réaction la plus récente — le champ historique de la ligne.
    public var latestReaction: String? { reactions.last }
}
