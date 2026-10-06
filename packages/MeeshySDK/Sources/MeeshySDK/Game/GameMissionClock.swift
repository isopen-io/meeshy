import Foundation

// MARK: - Le minuteur d'une mission (#9539, directive porteur 2026-10-06)
//
// Chaque carte de mission porte un MINUTEUR jusqu'à la fin de sa plage — celle de la mission personnelle (deux heures
// pleines), ou la fin du jour local pour les trois du jour. Passé la fin, la carte dit « Terminée » (elle était faite)
// ou « Manquée », et l'action (changer la mission) disparaît.
//
// Une pure fonction de DATES : aucune horloge, aucun minuteur ici. L'hôte passe `now` et choisit son rythme de
// rafraîchissement. Miroir de `apps/web/src/lib/game/mission-clock.ts`.

public enum GameMissionClock {

    public enum Phase: Equatable, Sendable {
        /// La plage n'a pas commencé : dans combien de temps.
        case upcoming(startsIn: TimeInterval)
        /// La plage court : ce qu'il en reste.
        case running(remaining: TimeInterval)
        /// Faite avant la fin : plus rien à attendre.
        case done
        /// La plage est passée et la mission était faite : « Terminée ».
        case finished
        /// La plage est passée et la mission ne l'était pas : « Manquée ».
        case missed

        /// L'action de la carte (changer la mission) n'existe que tant que la plage court.
        public var allowsAction: Bool {
            if case .running = self { return true }
            return false
        }

        /// Vrai quand la carte affiche un compte à rebours.
        public var isCounting: Bool {
            switch self {
            case .upcoming, .running: true
            case .done, .finished, .missed: false
            }
        }
    }

    public static func phase(start: Date?, end: Date, completed: Bool, now: Date) -> Phase {
        if now >= end { return completed ? .finished : .missed }
        if completed { return .done }
        if let start, now < start { return .upcoming(startsIn: start.timeIntervalSince(now)) }
        return .running(remaining: end.timeIntervalSince(now))
    }

    /// La fin du jour `AAAA-MM-JJ` : minuit local du lendemain. `nil` pour une clé qui n'en est pas une.
    public static func endOfDay(_ dayKey: String, calendar: Calendar = .current) -> Date? {
        let parts = dayKey.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3,
              let start = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])) else { return nil }
        return calendar.date(byAdding: .day, value: 1, to: start)
    }

    /// Une date ISO 8601 du serveur, avec ou sans fractions de seconde.
    public static func parse(_ iso: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: iso) { return date }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return plain.date(from: iso)
    }

    /// Le rythme de rafraîchissement du compte à rebours : une fois par minute tant qu'il en reste plus d'une heure,
    /// puis plus serré. Le minuteur est CALME — des heures et des minutes, jamais de secondes qui défilent.
    public static func refreshInterval(remaining: TimeInterval) -> TimeInterval {
        remaining > 3600 ? 60 : 30
    }
}
