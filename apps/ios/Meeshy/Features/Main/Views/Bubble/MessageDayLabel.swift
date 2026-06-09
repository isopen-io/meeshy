import Foundation

/// Logique pure de labellisation d'un séparateur de jour pour la liste des
/// messages. Renvoie un texte humain à afficher dans la pill flottante qui
/// sépare les groupes de messages d'un même jour. Les trois libellés relatifs
/// (« Aujourd'hui / Hier / Avant-hier ») sont fournis par l'appelant pour
/// suivre la langue d'interface de l'app ; les noms de jour et de mois
/// proviennent de la `locale` injectée via `DateFormatter`.
///
/// Contrat (Prisme UX, convention WhatsApp/iMessage adaptée) :
///   - même jour calendaire que `now`         → `today` (def. "Aujourd'hui")
///   - J-1                                    → `yesterday` (def. "Hier")
///   - J-2                                    → `dayBeforeYesterday` (def. "Avant-hier")
///   - J-3 à J-6                              → jour de semaine localisé ("Lundi")
///   - J-7+ même année                        → "Lundi 9 mai" (locale)
///   - année différente                       → "Lundi 19 mai 2025"
///
/// La comparaison se fait sur la frontière minuit du calendrier fourni :
/// deux dates qui n'occupent pas la même journée locale sont considérées
/// distantes d'au moins un jour, même si leur écart en secondes < 24h.
enum MessageDayLabel {

    static func label(
        for date: Date,
        now: Date,
        calendar: Calendar,
        locale: Locale,
        today: String = "Aujourd'hui",
        yesterday: String = "Hier",
        dayBeforeYesterday: String = "Avant-hier"
    ) -> String {
        let startOfToday = calendar.startOfDay(for: now)
        let startOfTarget = calendar.startOfDay(for: date)
        let daysDiff = calendar.dateComponents([.day], from: startOfTarget, to: startOfToday).day ?? 0

        // Une date au futur le même jour calendaire reste « Aujourd'hui » —
        // tolérance pour un horodatage client en avance de quelques minutes.
        if daysDiff <= 0 {
            return today
        }

        switch daysDiff {
        case 1: return yesterday
        case 2: return dayBeforeYesterday
        case 3...6: return weekdayName(date, calendar: calendar, locale: locale)
        default:
            let sameYear = calendar.component(.year, from: date) == calendar.component(.year, from: now)
            return fullDate(date, calendar: calendar, locale: locale, includeYear: !sameYear)
        }
    }

    // MARK: - Helpers

    private static func weekdayName(_ date: Date, calendar: Calendar, locale: Locale) -> String {
        let formatter = DayLabelFormatterCache.shared.formatter(format: "EEEE", calendar: calendar, locale: locale)
        return formatter.string(from: date).firstLetterUppercased(locale: locale)
    }

    private static func fullDate(_ date: Date, calendar: Calendar, locale: Locale, includeYear: Bool) -> String {
        let formatter = DayLabelFormatterCache.shared.formatter(
            format: includeYear ? "EEEE d MMMM yyyy" : "EEEE d MMMM",
            calendar: calendar,
            locale: locale
        )
        return formatter.string(from: date).firstLetterUppercased(locale: locale)
    }
}

/// Cache thread-safe des `DateFormatter` du séparateur de jour. `label()` est
/// appelé pendant le scroll (sticky day pill + décoration de section) pour tout
/// jour >= J-3 ; sans cache, chaque tick allouait un `DateFormatter` (init +
/// construction ICU paresseuse), un coût répété sur le thread de défilement.
/// Les formatters sont configurés une seule fois (clé = format + locale +
/// timeZone + calendrier) puis seulement lus — `DateFormatter.string(from:)`
/// est thread-safe en lecture concurrente tant qu'aucune propriété n'est mutée
/// après création (garanti ici : configuration uniquement à l'insertion).
private final class DayLabelFormatterCache: @unchecked Sendable {
    static let shared = DayLabelFormatterCache()
    private let lock = NSLock()
    private var formatters: [String: DateFormatter] = [:]

    func formatter(format: String, calendar: Calendar, locale: Locale) -> DateFormatter {
        let key = "\(format)|\(locale.identifier)|\(calendar.timeZone.identifier)|\(calendar.identifier)"
        lock.lock()
        defer { lock.unlock() }
        if let cached = formatters[key] { return cached }
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = locale
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = format
        formatters[key] = formatter
        return formatter
    }
}

private extension String {
    /// Capitalise uniquement la première lettre — laisse intacts "mai", "lundi"
    /// après le premier mot (`.capitalized` capitaliserait tous les mots).
    func firstLetterUppercased(locale: Locale) -> String {
        guard let first = first else { return self }
        return String(first).uppercased(with: locale) + dropFirst()
    }
}
