import Foundation

/// **« Le tête-à-tête avec X », quand il y en a deux** (#12966, #13006).
///
/// Une paire de personnes a au plus un tête-à-tête chiffré de bout en bout et
/// au plus un tête-à-tête que le serveur lit. Sans précision, c'est le
/// CHIFFRÉ qui s'ouvre, comme la passerelle le rend à
/// `POST /conversations { type: direct }` : le sens qui ferme. Sinon le plus
/// récemment actif. Une résolution locale qui prenait « le premier direct
/// avec ce pair » ouvrait l'un ou l'autre au hasard de l'ordre de la liste, et
/// le pair, en écrivant dans le fil lisible, pouvait y faire retomber l'autre
/// sans qu'il le voie.
///
/// « Chiffré » se lit comme partout (`EndToEndSendGate.requiresSeal`) : mode
/// posé, hors `server` et `hybrid` ; un mode inconnu compte. Côté app, la
/// mémoire du compte (« vue e2ee reste e2ee », #12949) s'ajoute par
/// `remembersEndToEnd`.
public enum DirectPairChoice {
    /// Combien de tête-à-tête la recherche serveur relit pour un pair : plus
    /// que les deux de la règle, pour les paires d'avant elle.
    public static let candidateLimit = 10

    public static func preferred(
        among conversations: [MeeshyConversation],
        with peerUserId: String,
        remembersEndToEnd: (String) -> Bool = { _ in false }
    ) -> MeeshyConversation? {
        let directs = conversations
            .filter { $0.type == .direct && $0.participantUserId == peerUserId }
            .sorted { $0.lastMessageAt > $1.lastMessageAt }
        return pick(directs, id: \.id, mode: \.encryptionMode, remembersEndToEnd: remembersEndToEnd)
    }

    /// Les tête-à-tête que la passerelle a rendus pour ce pair, dans son ordre
    /// (le plus récent d'abord).
    public static func preferred(among served: [APIConversation]) -> APIConversation? {
        pick(served.filter { $0.type.lowercased() == "direct" }, id: \.id, mode: \.encryptionMode, remembersEndToEnd: { _ in false })
    }

    private static func pick<C>(
        _ ordered: [C],
        id: KeyPath<C, String>,
        mode: KeyPath<C, String?>,
        remembersEndToEnd: (String) -> Bool
    ) -> C? {
        ordered.first // RED-STUB
    }
}
