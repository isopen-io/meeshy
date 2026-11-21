import Foundation

/// `PUT /me/location/ghost` (#19203) — le fantôme GLOBAL de position : « masque ma position pour tous, Sang compris ».
/// Hors drapeau Sang : il ne fait que retirer de la visibilité (partage temporaire et historique Sang compris).
public struct LocationGhostChange: Encodable, Sendable, Equatable {
    public let ghost: Bool

    public init(ghost: Bool) {
        self.ghost = ghost
    }
}

/// L'état que la passerelle a réglé. Une forme inattendue se lit `nil` : l'hôte garde alors sa dernière valeur.
public struct LocationGhostState: Decodable, Sendable, Equatable {
    public let ghost: Bool

    public init(ghost: Bool) {
        self.ghost = ghost
    }

    private enum CodingKeys: String, CodingKey { case ghost }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        ghost = try c.decode(Bool.self, forKey: .ghost)
    }
}
