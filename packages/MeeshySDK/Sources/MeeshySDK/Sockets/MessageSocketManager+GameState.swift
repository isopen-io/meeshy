import Foundation

// Extrait de `MessageSocketManager.swift`, hors budget de taille : le lot #10898 ajoute `game:updated` (#10900), le lot
// #16425 `game:missions-updated`.
// Responsabilité tenue ici : l'état du Jeu changé AILLEURS — une frappe, un gain, une reprise, un prestige ou une dépense
// faits sur un autre appareil ou par la passerelle.

/// `game:updated` (#10900) — `{ gameRevision, reason, game }`. `game` est le bloc servi au même instant que
/// `GET /me/engagement` le rendrait ; `nil` quand la passerelle n'a pas pu le composer (ou qu'il est illisible pour ce
/// client) : il faut alors relire la progression.
public struct GameUpdatedEvent: Decodable, Sendable, Equatable {
    public let gameRevision: Int
    public let reason: String
    public let game: GameBlock?

    public init(gameRevision: Int, reason: String, game: GameBlock?) {
        self.gameRevision = gameRevision
        self.reason = reason
        self.game = game
    }

    private enum CodingKeys: String, CodingKey { case gameRevision, reason, game }

    /// Un bloc que ce client ne comprend pas ne fait pas tomber l'événement : il se lit `nil`, et la progression se relit.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        gameRevision = try c.decode(Int.self, forKey: .gameRevision)
        reason = (try? c.decodeIfPresent(String.self, forKey: .reason)) ?? ""
        game = (try? c.decodeIfPresent(GameBlock.self, forKey: .game)) ?? nil
    }
}

/// `game:missions-updated` (#16425) — `{ dayKey }`, émis sur la room personnelle quand une mission du jour avance. Il ne
/// porte pas l'état : il dit « relis tes défis ». Un `dayKey` absent ou illisible se lit `nil` et l'événement passe quand
/// même — le relire coûte une lecture, le perdre laisse un défi figé à l'écran.
public struct GameMissionsUpdatedEvent: Decodable, Sendable, Equatable {
    public let dayKey: String?

    public init(dayKey: String?) {
        self.dayKey = dayKey
    }

    private enum CodingKeys: String, CodingKey { case dayKey }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        dayKey = (try? c.decodeIfPresent(String.self, forKey: .dayKey)) ?? nil
    }
}

public extension Notification.Name {
    /// `game:updated` — l'objet de la notification est un `GameUpdatedEvent`.
    static let gameStateUpdated = Notification.Name("me.meeshy.gameStateUpdated")
    /// `game:missions-updated` — l'objet de la notification est un `GameMissionsUpdatedEvent`.
    static let gameMissionsUpdated = Notification.Name("me.meeshy.gameMissionsUpdated")
}

/// Les routes du Jeu tiennent dans la TABLE, pas dans le gestionnaire : elles ne livrent qu'à `NotificationCenter` et
/// ne lisent rien de lui — comme `relations(_:)`.
extension MessageSocketRoutes {

    static func game(_ m: MessageSocketManager) -> [SocketInboundRoute] {
        [
            m.route(.gameUpdated, GameUpdatedEvent.self) { _, event in
                NotificationCenter.default.post(name: .gameStateUpdated, object: event)
            },
            m.route(.gameMissionsUpdated, GameMissionsUpdatedEvent.self) { _, event in
                NotificationCenter.default.post(name: .gameMissionsUpdated, object: event)
            },
        ]
    }
}
