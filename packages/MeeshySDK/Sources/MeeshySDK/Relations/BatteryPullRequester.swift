import Foundation

/// Qui demande ma batterie (#19565, contrat proposé par #19566) : de quoi le nommer et le montrer, rien d'autre. Un
/// identifiant ou un nom vide rend le demandeur illisible, et la demande se lit alors comme avant (sans auteur).
public struct BatteryPullRequester: Decodable, Sendable, Equatable {
    public let id: String
    public let displayName: String
    public let avatar: String?
    /// Le niveau effectif du lien ; inconnu ou absent ⇒ `nil`, jamais un niveau deviné.
    public let circle: RelationLevel?

    public init(id: String, displayName: String, avatar: String? = nil, circle: RelationLevel? = nil) {
        self.id = id
        self.displayName = displayName
        self.avatar = avatar
        self.circle = circle
    }

    private enum CodingKeys: String, CodingKey { case id, displayName, avatar, circle }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let id = try c.decode(String.self, forKey: .id).trimmingCharacters(in: .whitespacesAndNewlines)
        let name = try c.decode(String.self, forKey: .displayName).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !id.isEmpty, !name.isEmpty else {
            throw DecodingError.dataCorruptedError(forKey: .id, in: c, debugDescription: "demandeur sans id ou sans nom")
        }
        let avatar = ((try? c.decodeIfPresent(String.self, forKey: .avatar)) ?? nil)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .flatMap { $0.isEmpty ? nil : $0 }
        let circle = ((try? c.decodeIfPresent(String.self, forKey: .circle)) ?? nil).flatMap(RelationLevel.init(rawValue:))
        self.init(id: id, displayName: name, avatar: avatar, circle: circle)
    }
}

extension BatteryPullRequested {

    /// Le push silencieux `battery_pull` lu comme l'événement de socket : `requestedBy` y voyage en objet ou en
    /// chaîne JSON. Tout ce qui ne se lit pas rend une demande SANS auteur, donc le relevé automatique d'avant.
    public init(pushUserInfo userInfo: [AnyHashable: Any]) {
        let requester = Self.requesterObject(userInfo["requestedBy"])
        let optionalFields: [String: Any?] = [
            "requestedAt": userInfo["requestedAt"] as? String,
            "expiresAt": userInfo["expiresAt"] as? String,
            "requestedBy": requester
        ]
        let fields = optionalFields.compactMapValues { $0 }
        guard JSONSerialization.isValidJSONObject(fields),
              let data = try? JSONSerialization.data(withJSONObject: fields),
              let event = try? JSONDecoder().decode(BatteryPullRequested.self, from: data) else {
            self.init(requestedAt: Date())
            return
        }
        self = event
    }

    private static func requesterObject(_ raw: Any?) -> [String: Any]? {
        if let object = raw as? [String: Any] { return object }
        guard let text = raw as? String, let data = text.data(using: .utf8) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }
}
