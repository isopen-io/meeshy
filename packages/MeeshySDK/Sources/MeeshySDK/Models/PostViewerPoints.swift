import Foundation

// MARK: - Ce qu'un post a rapporté au lecteur (#9569, #9571, #9584)
//
// MIROIR de `packages/shared/types/engagement-scale.ts` (`PostEngagementSnapshot`,
// `isPostEngagementSnapshot`, `KnownViewerPoints`, `keptViewerPoints`). La
// passerelle sert `viewerPoints` sur les LECTURES d'un post (fil, fiche) et
// l'annonce après chaque geste crédité par `engagement:post-updated`
// `{ postId, viewerPoints, at }`, au seul lecteur crédité. La valeur est
// ABSOLUE et peut BAISSER (un contenu retiré reprend ses points) : entre deux
// annonces, la plus RÉCENTE (`at`) gagne.

/// `engagement:post-updated` — la valeur de `viewerPoints` d'un post à l'instant serveur `at` (ms).
public struct PostEngagementSnapshot: Decodable, Sendable, Equatable {
    public let postId: String
    public let viewerPoints: Int
    /// Instant serveur, en millisecondes depuis l'époque Unix.
    public let at: Int

    public init(postId: String, viewerPoints: Int, at: Int) {
        self.postId = postId
        self.viewerPoints = viewerPoints
        self.at = at
    }

    private enum CodingKeys: String, CodingKey {
        case postId, viewerPoints, at
    }

    /// Garde `isPostEngagementSnapshot` : un identifiant non vide, deux entiers ≥ 0.
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let postId = try container.decode(String.self, forKey: .postId)
        let viewerPoints = try container.decode(Int.self, forKey: .viewerPoints)
        let at = try container.decode(Int.self, forKey: .at)
        guard !postId.isEmpty, viewerPoints >= 0, at >= 0 else {
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath,
                                                    debugDescription: "engagement:post-updated malformé"))
        }
        self.init(postId: postId, viewerPoints: viewerPoints, at: at)
    }
}

/// Ce qu'un client sait de `viewerPoints` pour un post : la valeur, et l'instant
/// de la dernière ANNONCE appliquée (`nil` tant qu'aucune ne l'a été).
public struct KnownViewerPoints: Sendable, Equatable {
    public let viewerPoints: Int
    public let at: Int?

    public init(viewerPoints: Int, at: Int?) {
        self.viewerPoints = viewerPoints
        self.at = at
    }
}

public enum PostViewerPoints {

    /// Ce qu'un client GARDE quand une valeur lui arrive (`keptViewerPoints`) :
    /// - une ANNONCE (porte `at`) s'applique si elle n'est pas plus ancienne que
    ///   la dernière annonce appliquée, qu'elle monte ou qu'elle baisse ;
    /// - une LECTURE (sans `at`) s'applique et garde l'instant connu ;
    /// - champ absent : rien ne change.
    public static func kept(_ known: KnownViewerPoints?, viewerPoints: Int?, at: Int?) -> KnownViewerPoints? {
        guard let viewerPoints else { return known }
        guard let at else { return KnownViewerPoints(viewerPoints: viewerPoints, at: known?.at) }
        if let knownAt = known?.at, at < knownAt { return known }
        return KnownViewerPoints(viewerPoints: viewerPoints, at: at)
    }

    /// La marque ne paraît que pour un gain : `nil` ou `0` ⇒ aucune marque.
    public static func shown(_ viewerPoints: Int?) -> Int? {
        guard let viewerPoints, viewerPoints > 0 else { return nil }
        return viewerPoints
    }
}
