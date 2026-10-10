import Foundation

// MARK: - Les écritures du Jeu Meeshy (#9378)
//
// MIROIR de `packages/shared/types/game.ts` (requêtes et réponses des cinq
// écritures). Toutes portent un `requestId` — généré UNE fois par INTENTION,
// jamais par requête : rejouer une écriture rend son résultat, jamais une
// seconde écriture.
//
// Les `status` restent des CHAÎNES : un statut ajouté par le serveur ne doit
// pas faire échouer le décodage d'une écriture DÉJÀ faite (l'utilisateur verrait
// une erreur sur un geste qui a réussi). `alreadyDone` lit le préfixe commun.

/// Le corps commun : l'identifiant d'idempotence (8 à 64 caractères).
public struct GameWriteRequest: Encodable, Sendable, Equatable {
    public let requestId: String

    public init(requestId: String) {
        self.requestId = requestId
    }
}

public struct GuideSeenRequest: Encodable, Sendable, Equatable {
    public let requestId: String
    /// 1 à 32 clés de 64 caractères au plus.
    public let keys: [String]

    public init(requestId: String, keys: [String]) {
        self.requestId = requestId
        self.keys = keys
    }
}

public struct MissionRerollResponse: Decodable, Sendable, Equatable {
    public let mission: GameBlock.Mission
    public let balance: Int

    public init(mission: GameBlock.Mission, balance: Int) {
        self.mission = mission
        self.balance = balance
    }
}

public struct ChestClaimResponse: Decodable, Sendable, Equatable {
    /// `claimed` | `already-claimed`.
    public let status: String
    public let reward: DailyChest
    /// Le score en poche après le crédit.
    public let score: Int

    public var alreadyDone: Bool { status.hasPrefix("already-") }

    public init(status: String, reward: DailyChest, score: Int) {
        self.status = status
        self.reward = reward
        self.score = score
    }
}

public struct FlameFreezeResponse: Decodable, Sendable, Equatable {
    /// `bought` | `already-bought`.
    public let status: String
    public let freezes: Int
    public let balance: Int

    public var alreadyDone: Bool { status.hasPrefix("already-") }

    public init(status: String, freezes: Int, balance: Int) {
        self.status = status
        self.freezes = freezes
        self.balance = balance
    }
}

public struct FlameRelightResponse: Decodable, Sendable, Equatable {
    /// `relit` | `already-relit`.
    public let status: String
    public let streak: Int
    public let balance: Int

    public var alreadyDone: Bool { status.hasPrefix("already-") }

    public init(status: String, streak: Int, balance: Int) {
        self.status = status
        self.streak = streak
        self.balance = balance
    }
}

public struct GuideSeenResponse: Decodable, Sendable, Equatable {
    public let guideSeen: [String]

    public init(guideSeen: [String]) {
        self.guideSeen = guideSeen
    }
}
