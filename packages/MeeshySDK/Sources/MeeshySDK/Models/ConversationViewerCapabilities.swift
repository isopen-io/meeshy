import Foundation

/// Ce que la passerelle accorde au LECTEUR sur une conversation (#14690) — miroir de
/// `ConversationViewerCapabilities` (`packages/shared/types/conversation.ts`). Servi par la
/// liste, le détail et `conversation:new`, calculé par la décision même qui garde la route.
///
/// `canMakeObsolete` : `DELETE /conversations/:id/obsolete` accepterait cet appelant. `nil` =
/// non servi ou illisible : le client garde sa règle locale, jamais un « non » implicite. Le
/// décodage ne jette jamais : une charge malformée ne fait pas tomber la conversation.
public struct ConversationViewerCapabilities: Codable, Hashable, Sendable {
    public let canMakeObsolete: Bool?

    public init(canMakeObsolete: Bool?) {
        self.canMakeObsolete = canMakeObsolete
    }

    private enum CodingKeys: String, CodingKey {
        case canMakeObsolete
    }

    public init(from decoder: Decoder) throws {
        let container = try? decoder.container(keyedBy: CodingKeys.self)
        canMakeObsolete = (try? container?.decodeIfPresent(Bool.self, forKey: .canMakeObsolete)) ?? nil
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(canMakeObsolete, forKey: .canMakeObsolete)
    }
}
