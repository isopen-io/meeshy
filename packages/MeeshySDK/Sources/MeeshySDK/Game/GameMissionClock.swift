import Foundation

// MARK: - Le minuteur d'une mission (#9539, directive porteur 2026-10-06)
//
// Chaque carte de mission porte un MINUTEUR jusqu'à la fin de sa plage — celle de la mission personnelle (deux heures
// pleines), ou la fin du jour de jeu (minuit dans le fuseau du COMPTE) pour les trois du jour. Passé la fin, la carte
// dit « Terminée » (elle était faite) ou « Manquée », et l'action (changer la mission) disparaît.
//
// Une pure fonction de DATES : aucune horloge, aucun minuteur ici. L'hôte passe `now` et choisit son rythme de
// rafraîchissement.

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

    /// La fin du jour de jeu `AAAA-MM-JJ` : minuit du lendemain DANS LE FUSEAU DU COMPTE, au calendrier grégorien.
    ///
    /// La passerelle découpe le jour de jeu dans `User.timezone`, et en UTC quand il manque ou qu'il est inconnu
    /// (`dayKeyOf`, `effectiveZone`) : c'est là que la clé change, donc là que la plage se ferme. Le minuit de
    /// l'APPAREIL disait « Manquée » pendant que la mission courait encore (compte sans fuseau lu à Paris entre
    /// minuit et 2 h, voyageur), et le calendrier de l'appareil lisait 2026 dans une autre ère (bouddhiste,
    /// japonais) : tout y était « Manquée ». `nil` pour une clé qui n'est pas un jour du calendrier.
    public static func endOfDay(_ dayKey: String, timezone: String?) -> Date? {
        let fields = dayKey.split(separator: "-", omittingEmptySubsequences: false)
        let parts = fields.compactMap { Int($0) }
        guard fields.count == 3, parts.count == 3 else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = gameZone(timezone)
        guard let start = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])) else { return nil }
        let read = calendar.dateComponents([.year, .month, .day], from: start)
        guard read.year == parts[0], read.month == parts[1], read.day == parts[2] else { return nil }
        return calendar.date(byAdding: .day, value: 1, to: start)
    }

    /// Le fuseau où se découpe le jour de jeu : celui du compte, ou UTC — le même repli que la passerelle.
    public static func gameZone(_ identifier: String?) -> TimeZone {
        let utc = TimeZone(identifier: "UTC") ?? TimeZone(secondsFromGMT: 0) ?? .current
        guard let identifier, !identifier.isEmpty else { return utc }
        return TimeZone(identifier: identifier) ?? utc
    }

    /// Une date ISO 8601 du serveur, avec ou sans fractions de seconde — par `WireDate`, jamais un formateur local.
    public static func parse(_ iso: String) -> Date? {
        WireDate.date(from: iso)
    }

    /// Le rythme de rafraîchissement du compte à rebours : une fois par minute tant qu'il en reste plus d'une heure,
    /// puis plus serré. Le minuteur est CALME — des heures et des minutes, jamais de secondes qui défilent.
    public static func refreshInterval(remaining: TimeInterval) -> TimeInterval {
        remaining > 3600 ? 60 : 30
    }
}
