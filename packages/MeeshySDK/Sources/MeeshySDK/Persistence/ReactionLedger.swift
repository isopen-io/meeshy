import Foundation

/// La loi PURE des réactions de message écrites dans `reactionsJson` (#7927).
///
/// Une ligne de réaction porte une CLÉ d'auteur (`participantId`) qui n'a pas
/// la même nature selon qui l'a écrite :
/// - la ligne optimiste et la reconstruction REST de MA réaction sont keyées
///   par `currentUserId` (le `User.id`) — c'est la clé que teste la pastille
///   « c'est moi » ;
/// - l'écho socket d'un tiers est keyé par son `Participant.id` ;
/// - la reconstruction REST des réactions des AUTRES n'en porte aucune (`nil`) :
///   le résumé agrégé ne nomme pas ses réacteurs.
///
/// D'où les deux règles de ce type. Ma réaction venue d'un autre appareil
/// s'écrit sous `currentUserId`, jamais sous mon `Participant.id` : sinon elle
/// n'est pas « mienne » ici, un tap ajoute un doublon et elle ne se retire
/// plus. Et le retrait d'un tiers se CALE sur l'agrégat servi, seule vérité
/// qui sache compter des lignes sans auteur — sans jamais toucher MA ligne.
enum ReactionLedger {

    /// L'agrégat que le serveur sert APRÈS l'action (`aggregation`).
    struct Aggregate: Sendable, Equatable {
        let count: Int
        let participantIds: [String]?
    }

    /// La clé sous laquelle une réaction reçue s'écrit.
    static func rowKey(participantId: String?, ownerUserId: String?, currentUserId: String?) -> String? {
        guard let ownerUserId, let currentUserId, ownerUserId == currentUserId else { return participantId }
        return currentUserId
    }

    /// `nil` ⇒ rien à écrire.
    static func appending(
        _ reactions: [MeeshyReaction], reactionId: String, messageId: String, emoji: String,
        participantId: String?, ownerUserId: String?, currentUserId: String?, maxCount: Int?
    ) -> [MeeshyReaction]? {
        let key = rowKey(participantId: participantId, ownerUserId: ownerUserId, currentUserId: currentUserId)
        let alreadyExists = reactions.contains { row in
            guard row.emoji == emoji else { return false }
            if row.participantId == key { return true }
            if let participantId, row.participantId == participantId { return true }
            if let ownerUserId, row.participantId == ownerUserId { return true }
            return false
        }
        guard !alreadyExists else { return nil }
        if let maxCount, reactions.filter({ $0.emoji == emoji }).count >= maxCount { return nil }
        return reactions + [MeeshyReaction(id: reactionId, messageId: messageId, participantId: key, emoji: emoji)]
    }

    /// `nil` ⇒ rien à écrire.
    static func removing(
        _ reactions: [MeeshyReaction], emoji: String, participantId: String?,
        ownerUserId: String?, currentUserId: String?, aggregate: Aggregate?
    ) -> [MeeshyReaction]? {
        let authorIsMe = ownerUserId != nil && ownerUserId == currentUserId
        let isMine: (MeeshyReaction) -> Bool = { row in
            currentUserId != nil && row.participantId == currentUserId
        }
        let matchesAuthor: (MeeshyReaction) -> Bool = { row in
            guard row.emoji == emoji else { return false }
            if isMine(row) { return authorIsMe || (participantId != nil && participantId == currentUserId) }
            if let participantId, row.participantId == participantId { return true }
            if let ownerUserId, row.participantId == ownerUserId { return true }
            return false
        }
        let withoutAuthor = reactions.filter { !matchesAuthor($0) }
        let removedByAuthor = withoutAuthor.count != reactions.count

        let result: [MeeshyReaction] = {
            if let aggregate {
                return calibrated(withoutAuthor, emoji: emoji, aggregate: aggregate, isMine: isMine)
            }
            guard !removedByAuthor, !authorIsMe,
                  let index = withoutAuthor.lastIndex(where: { $0.emoji == emoji && $0.participantId == nil })
            else { return withoutAuthor }
            return withoutAuthor.enumerated().filter { $0.offset != index }.map(\.element)
        }()
        return result.map(\.id) == reactions.map(\.id) ? nil : result
    }

    /// Cale le nombre de lignes de `emoji` sur l'agrégat servi : d'abord les
    /// lignes attribuées à un participant que l'agrégat ne nomme plus, puis les
    /// lignes sans auteur, puis les autres lignes d'autrui. MA ligne n'est
    /// jamais retirée ici : si l'agrégat la contredit, le prochain rechargement
    /// tranchera — un événement d'autrui ne décide pas de ce que j'ai fait.
    private static func calibrated(
        _ reactions: [MeeshyReaction], emoji: String, aggregate: Aggregate,
        isMine: (MeeshyReaction) -> Bool
    ) -> [MeeshyReaction] {
        let served = aggregate.participantIds.map(Set.init)
        let pruned = reactions.filter { row in
            guard row.emoji == emoji, let pid = row.participantId, !isMine(row), let served else { return true }
            return served.contains(pid)
        }
        let target = max(0, aggregate.count)
        let excess = pruned.filter { $0.emoji == emoji }.count - target
        guard excess > 0 else { return pruned }
        let removable = pruned.indices.filter { pruned[$0].emoji == emoji && !isMine(pruned[$0]) }
        let unattributed: [Int] = removable.filter { pruned[$0].participantId == nil }.reversed()
        let attributed: [Int] = removable.filter { pruned[$0].participantId != nil }.reversed()
        let dropped = Set((unattributed + attributed).prefix(excess))
        return pruned.indices.filter { !dropped.contains($0) }.map { pruned[$0] }
    }
}
