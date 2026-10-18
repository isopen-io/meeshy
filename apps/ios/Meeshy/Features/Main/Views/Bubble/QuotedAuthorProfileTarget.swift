import Foundation

/// **Qui ouvre l'avatar d'une citation : un compte identifié, ou personne.**
/// Sans identifiant d'auteur, la fiche n'a rien à demander au serveur : elle
/// s'ouvrait nom-seule et vide. Le message cité du store prime sur la citation,
/// qui n'est qu'un instantané gravé.
enum QuotedAuthorProfileTarget {
    static func userId(quotedSenderId: String?, referenceAuthorUserId: String?) -> String? {
        [quotedSenderId, referenceAuthorUserId]
            .compactMap { $0 }
            .first { !$0.isEmpty }
    }
}
