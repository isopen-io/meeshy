import Foundation

/// L'état d'activation du compte courant (#8239, loi serveur #8238), servi dans
/// la charge de soi (connexion et `/auth/me`) :
/// `activation: { phase, deadline, missing }`.
///
/// - `quiet` : J0–J7, rien n'est demandé ;
/// - `invite` : J7–J28, l'app invite à prouver l'adresse et à ajouter un numéro ;
/// - `blocked` : après J28, la connexion mène à l'écran du code ;
/// - `done` : adresse prouvée — le numéro peut encore manquer.
///
/// Le décodage est TOLÉRANT : une phase inconnue rend `phase == nil` (jamais
/// d'invitation fabriquée) et un canal inconnu est écarté seul. Une forme
/// nouvelle côté passerelle ne fait donc jamais tomber le décodage de
/// l'utilisateur entier.
public struct UserActivation: Codable, Sendable, Equatable {
    public enum Phase: String, Codable, Sendable {
        case quiet, invite, blocked, done
    }

    public enum Channel: String, Codable, Sendable {
        case email, phone
    }

    public let phase: Phase?
    public let deadline: String?
    public let missing: [Channel]

    public init(phase: Phase?, deadline: String?, missing: [Channel]) {
        self.phase = phase
        self.deadline = deadline
        self.missing = missing
    }

    private enum CodingKeys: String, CodingKey {
        case phase, deadline, missing
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        phase = ((try? container.decodeIfPresent(String.self, forKey: .phase)) ?? nil).flatMap(Phase.init(rawValue:))
        deadline = (try? container.decodeIfPresent(String.self, forKey: .deadline)) ?? nil
        let channels = (try? container.decodeIfPresent([String].self, forKey: .missing)) ?? nil
        missing = (channels ?? []).compactMap(Channel.init(rawValue:))
    }

    /// Une invitation n'a de sens qu'en phase `invite` ET s'il reste quelque
    /// chose à demander.
    public var invites: Bool {
        phase == .invite && !missing.isEmpty
    }

    /// Les jours restants avant le blocage, arrondis au jour supérieur et
    /// jamais négatifs — `nil` sans échéance lisible.
    public func daysLeft(now: Date = Date()) -> Int? {
        guard let deadline, let at = Self.parse(deadline) else { return nil }
        return max(0, Int((at.timeIntervalSince(now) / 86_400).rounded(.up)))
    }

    private static func parse(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
}
