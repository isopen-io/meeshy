import Foundation

/// **Qui ouvre l'avatar d'une citation : un compte identifié, ou personne.**
/// Sans identifiant de COMPTE, la fiche n'a rien à demander au serveur : elle
/// s'ouvrait nom-seule et vide. Le message cité du store prime sur la citation,
/// qui n'est qu'un instantané gravé. `MeeshyMessage.senderId` est l'identifiant
/// de PARTICIPATION : seul `senderUserId` désigne un compte.
enum QuotedAuthorProfileTarget {
    static func userId(quotedSenderUserId: String?, referenceAuthorUserId: String?) -> String? {
        [quotedSenderUserId, referenceAuthorUserId]
            .compactMap { $0 }
            .first { !$0.isEmpty }
    }
}
