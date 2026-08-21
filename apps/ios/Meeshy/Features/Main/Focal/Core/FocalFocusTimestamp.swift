import Foundation

/// Horodatage du message EN FOCUS (Focal, 2026-08-21, directive user) :
/// « Aujourd'hui 12:45 », « Hier 18:45 », « Mardi 23:40 » dans la semaine,
/// puis « Sam. 3 oct. » — avec l'année si ce n'est pas l'année en cours
/// (« Sam. 3 oct. 2025 »). Jour ET heure, toujours : le message en
/// magnificence porte sa date complète.
///
/// Règle pure, `now`/`calendar`/`locale` injectés ; les mots « Aujourd'hui »
/// / « Hier » / « Avant-hier » viennent du catalogue (`date.*`) par
/// l'appelant — jamais de français en dur hors défaut de test.
nonisolated enum FocalFocusTimestamp {

    /// Au-delà de cette ancienneté (en jours calendaires), la date abrégée
    /// remplace le nom du jour.
    static let weekdayWindowDays = 6

    static func label(
        sentAt: Date,
        timeString: String,
        now: Date,
        calendar: Calendar,
        locale: Locale,
        today: String = "Aujourd'hui",
        yesterday: String = "Hier",
        dayBeforeYesterday: String = "Avant-hier"
    ) -> String {
        let startOfToday = calendar.startOfDay(for: now)
        let startOfTarget = calendar.startOfDay(for: sentAt)
        let daysDiff = calendar.dateComponents([.day], from: startOfTarget, to: startOfToday).day ?? 0

        if daysDiff <= 0 { return "\(today) \(timeString)" }
        switch daysDiff {
        case 1: return "\(yesterday) \(timeString)"
        case 2: return "\(dayBeforeYesterday) \(timeString)"
        case 3...weekdayWindowDays:
            var style = Date.FormatStyle.dateTime.weekday(.wide).locale(locale)
            style.calendar = calendar
            return "\(capitalized(sentAt.formatted(style), locale: locale)) \(timeString)"
        default:
            var style = Date.FormatStyle.dateTime.weekday(.abbreviated).day(.defaultDigits).month(.abbreviated).locale(locale)
            style.calendar = calendar
            let sameYear = calendar.component(.year, from: sentAt) == calendar.component(.year, from: now)
            let day = sameYear ? sentAt.formatted(style) : sentAt.formatted(style.year(.defaultDigits))
            return "\(capitalized(day, locale: locale)) · \(timeString)"
        }
    }

    private static func capitalized(_ text: String, locale: Locale) -> String {
        guard let first = text.first else { return text }
        return String(first).uppercased(with: locale) + text.dropFirst()
    }
}
