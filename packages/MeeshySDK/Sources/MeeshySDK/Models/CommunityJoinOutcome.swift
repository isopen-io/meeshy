import Foundation

/// Ce que `POST /communities/:id/join` rend à un client qui annonce la demande
/// en attente (`acceptsPending`, #19429) : une adhésion — le membre écrit —, ou,
/// pour une communauté qui valide chaque entrée, une DEMANDE (202
/// `{ status: 'pending', requestId }`) qui ne fait encore membre de rien.
public enum CommunityJoinOutcome: Decodable, Sendable {
    case joined(APICommunityMember)
    case pending(requestId: String)

    private enum CodingKeys: String, CodingKey { case status, requestId }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        // Une rangée de membre porte aussi un `status` (#19290) : c'est `requestId`,
        // propre à la réponse 202, qui désigne la demande.
        if try container.decodeIfPresent(String.self, forKey: .status) == "pending",
           let requestId = try container.decodeIfPresent(String.self, forKey: .requestId) {
            self = .pending(requestId: requestId)
            return
        }
        self = .joined(try APICommunityMember(from: decoder))
    }

    /// Vrai seulement quand le lecteur est entré : une demande en attente n'est pas une adhésion.
    public var isJoined: Bool {
        if case .joined = self { return true }
        return false
    }
}

/// Les refus de la jonction que l'écran dit dans la langue du lecteur, lus par
/// leur `code` machine — jamais par le message du serveur.
public enum CommunityJoinRefusal: Equatable, Sendable {
    /// 403 `COMMUNITY_JOIN_COOLDOWN` : une demande refusée il y a moins de sept jours.
    case cooldown

    public static func classify(_ error: Error) -> CommunityJoinRefusal? {
        guard case let MeeshyError.forbidden(_, body?) = error,
              let payload = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
              payload["code"] as? String == "COMMUNITY_JOIN_COOLDOWN" else { return nil }
        return .cooldown
    }
}
