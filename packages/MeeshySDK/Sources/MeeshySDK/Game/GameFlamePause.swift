import Foundation

// MARK: - La Flamme en veille (#17372, #20510)
//
// MIROIR de `packages/shared/utils/game/flame-pause.ts`. Le joueur ANNONCE une
// pause de 1 à 7 jours, une fois par trimestre civil : pendant la veille, la
// Flamme attend. La veille commence le LENDEMAIN de l'annonce. Les jours sont des
// clés `AAAA-MM-JJ` dans le fuseau du joueur : pur, sans horloge.

/// Une veille servie par le bloc `flame` : ses premier et dernier jours, inclus. Le décodage REFUSE deux jours
/// illisibles : le bloc la lit en `try?`, si bien qu'une forme illisible rend la carte d'avant.
public struct GameFlamePause: Codable, Sendable, Equatable {
    public let from: String
    public let until: String

    public init(from: String, until: String) {
        self.from = from
        self.until = until
    }

    private enum CodingKeys: String, CodingKey {
        case from, until
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        from = try container.decode(String.self, forKey: .from)
        until = try container.decode(String.self, forKey: .until)
        guard GameDay.isDayKey(from), GameDay.isDayKey(until) else {
            throw DecodingError.dataCorruptedError(forKey: .until, in: container, debugDescription: "veille illisible")
        }
    }

    /// Annoncée mais pas encore commencée : elle part toujours du lendemain de l'annonce.
    public func startsAfter(_ today: String) -> Bool {
        (GameDay.diff(from: today, to: from) ?? 0) > 0
    }
}

/// Pourquoi une veille est refusée — la `reason` que la passerelle pose sur `FLAME_PAUSE_NOT_ALLOWED`.
public enum FlamePauseRefusal: String, Sendable, Hashable {
    case invalidDays = "invalid-days"
    case noFlame = "no-flame"
    case alreadyPaused = "already-paused"
    case quarterlyLimit = "quarterly-limit"
}

public enum FlamePauseDecision: Sendable, Equatable {
    case allowed(GameFlamePause)
    case refused(FlamePauseRefusal)
}

public enum GameFlamePauseLaw {
    public static let minDays = 1
    public static let maxDays = 7
    public static let dayChoices: [Int] = Array(minDays...maxDays)

    /// Le trimestre civil d'un jour : `AAAA-T1` à `AAAA-T4`.
    public static func quarter(of dayKey: String) -> String {
        let month = Int(dayKey.dropFirst(5).prefix(2)) ?? 1
        return "\(dayKey.prefix(4))-T\((month - 1) / 3 + 1)"
    }

    /// Une veille vide (terminée avant son premier jour) n'existe pas.
    private static func lasting(_ pause: GameFlamePause?) -> GameFlamePause? {
        guard let pause, let span = GameDay.diff(from: pause.from, to: pause.until), span >= 0 else { return nil }
        return pause
    }

    /// Annoncer une veille de `days` jours, à partir de demain. Refusée hors de 1 à 7 jours, à une Flamme absente ou
    /// éteinte, pendant une veille en cours ou à venir, et une seconde fois dans le trimestre où elle commencerait.
    public static func canPause(today: String, days: Int, status: FlameStatus, pause: GameFlamePause?) -> FlamePauseDecision {
        guard (minDays...maxDays).contains(days) else { return .refused(.invalidDays) }
        guard status != .none, status != .out else { return .refused(.noFlame) }
        guard let from = GameDay.add(1, to: today), let until = GameDay.add(days, to: today) else {
            return .refused(.invalidDays)
        }
        if let previous = lasting(pause) {
            if (GameDay.diff(from: today, to: previous.until) ?? -1) >= 0 { return .refused(.alreadyPaused) }
            if quarter(of: previous.from) == quarter(of: from) { return .refused(.quarterlyLimit) }
        }
        return .allowed(GameFlamePause(from: from, until: until))
    }

    /// Une Flamme vivante peut s'annoncer en veille : allumée, à risque ou gardée.
    public static func isBurning(_ status: FlameStatus) -> Bool {
        status == .lit || status == .atRisk || status == .covered
    }
}

public struct FlamePauseRequest: Encodable, Sendable, Equatable {
    public let requestId: String
    public let days: Int

    public init(requestId: String, days: Int) {
        self.requestId = requestId
        self.days = days
    }
}

public struct FlamePauseResponse: Decodable, Sendable, Equatable {
    /// `paused` | `already-paused`.
    public let status: String
    public let pause: GameFlamePause

    public var alreadyDone: Bool { status.hasPrefix("already-") }

    public init(status: String, pause: GameFlamePause) {
        self.status = status
        self.pause = pause
    }
}
