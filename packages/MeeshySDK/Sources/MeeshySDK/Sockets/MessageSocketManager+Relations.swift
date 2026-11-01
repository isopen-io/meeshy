import Combine
import Foundation

// Extrait de `MessageSocketManager.swift`, hors budget de taille : le lot #13938 ajoute les quatre événements du lien
// (#13933). Responsabilité tenue ici : le lien entre deux personnes MONTE, et le rituel du Sang se joue à deux.
//
// Tous serveur -> client, tous sur la room `user:<id>` (`packages/shared/types/socketio-events/relation-event-names.ts`).
// Chaque charge nomme `userId` = l'AUTRE personne, du point de vue du destinataire. Il n'existe AUCUN événement de baisse,
// de sortie ni de refus : ce sont des gestes silencieux (RG-07), et le client n'en écoute donc aucun.

/// Les trois états qu'un participant du rituel peut annoncer (`RelationRitualStage`).
public enum RelationRitualStage: String, Sendable, Equatable {
    /// L'autre tient l'écran.
    case held
    /// L'autre a confirmé.
    case confirmed
    /// L'autre a lâché : le rituel est abandonné, rien n'est enregistré.
    case lapsed
}

/// `relation:level-raised` — le niveau effectif de la paire a monté (aux DEUX).
public struct RelationLevelRaisedEvent: Decodable, Sendable, Equatable {
    public let userId: String
    public let level: RelationLevel
    public let at: String?

    public init(userId: String, level: RelationLevel, at: String?) {
        self.userId = userId
        self.level = level
        self.at = at
    }

    private enum CodingKeys: String, CodingKey { case userId, level, at }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        userId = try c.decode(String.self, forKey: .userId)
        level = RelationLevel(wire: try? c.decodeIfPresent(String.self, forKey: .level))
        at = (try? c.decodeIfPresent(String.self, forKey: .at)) ?? nil
    }
}

/// `relation:ritual-started` — l'autre a ouvert (ou rejoint) le rituel du Sang.
public struct RelationRitualStartedEvent: Decodable, Sendable, Equatable {
    public let token: String
    public let userId: String
    public let requestId: String
    public let expiresAt: String
    public let holdWindowMs: Int

    public init(token: String, userId: String, requestId: String, expiresAt: String, holdWindowMs: Int) {
        self.token = token
        self.userId = userId
        self.requestId = requestId
        self.expiresAt = expiresAt
        self.holdWindowMs = holdWindowMs
    }
}

/// `relation:ritual-progress` — l'autre a tenu l'écran, confirmé, ou lâché. Un état qu'un serveur plus récent
/// ajouterait se lit `nil` : l'événement ne casse pas le décodage, et l'écran l'ignore.
public struct RelationRitualProgressEvent: Decodable, Sendable, Equatable {
    public let token: String
    public let userId: String
    public let stage: RelationRitualStage?

    public init(token: String, userId: String, stage: RelationRitualStage?) {
        self.token = token
        self.userId = userId
        self.stage = stage
    }

    private enum CodingKeys: String, CodingKey { case token, userId, stage }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        token = try c.decode(String.self, forKey: .token)
        userId = try c.decode(String.self, forKey: .userId)
        let rawStage = (try? c.decodeIfPresent(String.self, forKey: .stage)) ?? nil
        stage = rawStage.flatMap(RelationRitualStage.init(rawValue:))
    }
}

/// `relation:ritual-completed` — les deux ont confirmé : le lien vaut Sang.
public struct RelationRitualCompletedEvent: Decodable, Sendable, Equatable {
    public let token: String
    public let userId: String
    public let level: RelationLevel
    public let at: String?

    public init(token: String, userId: String, level: RelationLevel, at: String?) {
        self.token = token
        self.userId = userId
        self.level = level
        self.at = at
    }

    private enum CodingKeys: String, CodingKey { case token, userId, level, at }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        token = try c.decode(String.self, forKey: .token)
        userId = try c.decode(String.self, forKey: .userId)
        level = RelationLevel(wire: try? c.decodeIfPresent(String.self, forKey: .level))
        at = (try? c.decodeIfPresent(String.self, forKey: .at)) ?? nil
    }
}

public extension Notification.Name {
    /// `relation:level-raised` — l'objet de la notification est un `RelationLevelRaisedEvent`.
    static let relationLevelRaised = Notification.Name("me.meeshy.relationLevelRaised")
    /// `relation:ritual-started` — l'objet est un `RelationRitualStartedEvent`.
    static let relationRitualStarted = Notification.Name("me.meeshy.relationRitualStarted")
    /// `relation:ritual-progress` — l'objet est un `RelationRitualProgressEvent`.
    static let relationRitualProgress = Notification.Name("me.meeshy.relationRitualProgress")
    /// `relation:ritual-completed` — l'objet est un `RelationRitualCompletedEvent`.
    static let relationRitualCompleted = Notification.Name("me.meeshy.relationRitualCompleted")
}

/// Les quatre flux du lien, typés. Un écran s'y abonne ; il n'a pas à connaître `NotificationCenter`.
public enum RelationEvents {
    public static var levelRaised: AnyPublisher<RelationLevelRaisedEvent, Never> {
        publisher(.relationLevelRaised)
    }

    public static var ritualStarted: AnyPublisher<RelationRitualStartedEvent, Never> {
        publisher(.relationRitualStarted)
    }

    public static var ritualProgress: AnyPublisher<RelationRitualProgressEvent, Never> {
        publisher(.relationRitualProgress)
    }

    public static var ritualCompleted: AnyPublisher<RelationRitualCompletedEvent, Never> {
        publisher(.relationRitualCompleted)
    }

    private static func publisher<Event>(_ name: Notification.Name) -> AnyPublisher<Event, Never> {
        NotificationCenter.default.publisher(for: name)
            .compactMap { $0.object as? Event }
            .eraseToAnyPublisher()
    }
}

extension MessageSocketRoutes {

    static func relations(_ m: MessageSocketManager) -> [SocketInboundRoute] {
        [
            m.route(.relationLevelRaised, RelationLevelRaisedEvent.self) { _, event in
                NotificationCenter.default.post(name: .relationLevelRaised, object: event)
            },
            m.route(.relationRitualStarted, RelationRitualStartedEvent.self) { _, event in
                NotificationCenter.default.post(name: .relationRitualStarted, object: event)
            },
            m.route(.relationRitualProgress, RelationRitualProgressEvent.self) { _, event in
                NotificationCenter.default.post(name: .relationRitualProgress, object: event)
            },
            m.route(.relationRitualCompleted, RelationRitualCompletedEvent.self) { _, event in
                NotificationCenter.default.post(name: .relationRitualCompleted, object: event)
            },
        ]
    }
}
