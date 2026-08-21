import Foundation

/// Horodatage du message EN FOCUS (Focal, 2026-08-21, directive user) :
/// « Aujourd'hui 12:45 », « Hier 18:45 », « Mardi 23:40 » dans la semaine,
/// puis « Sam. 3 oct. » — avec l'année si ce n'est pas l'année en cours
/// (« Sam. 3 oct. 2025 »). Jour ET heure, toujours : le message en
/// magnificence porte sa date complète.
///
/// La LISTE (carte de focus Lentille) lit la même règle avec le joint « à »
/// (`listLabel`) : « Aujourd'hui à 5:49 », « Hier à 22:12 », « Mardi à 23:50 ».
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
        dayBeforeYesterday: String = "Avant-hier",
        joiner: String = " ",
        dateJoiner: String = " · "
    ) -> String {
        let startOfToday = calendar.startOfDay(for: now)
        let startOfTarget = calendar.startOfDay(for: sentAt)
        let daysDiff = calendar.dateComponents([.day], from: startOfTarget, to: startOfToday).day ?? 0

        if daysDiff <= 0 { return "\(today)\(joiner)\(timeString)" }
        switch daysDiff {
        case 1: return "\(yesterday)\(joiner)\(timeString)"
        case 2: return "\(dayBeforeYesterday)\(joiner)\(timeString)"
        case 3...weekdayWindowDays:
            var style = Date.FormatStyle.dateTime.weekday(.wide).locale(locale)
            style.calendar = calendar
            return "\(capitalized(sentAt.formatted(style), locale: locale))\(joiner)\(timeString)"
        default:
            var style = Date.FormatStyle.dateTime.weekday(.abbreviated).day(.defaultDigits).month(.abbreviated).locale(locale)
            style.calendar = calendar
            let sameYear = calendar.component(.year, from: sentAt) == calendar.component(.year, from: now)
            let day = sameYear ? sentAt.formatted(style) : sentAt.formatted(style.year(.defaultDigits))
            return "\(capitalized(day, locale: locale))\(dateJoiner)\(timeString)"
        }
    }

    /// Le joint « à » de la LISTE (« Aujourd'hui à 5:49 », « Mardi à 23:50 »,
    /// « Sam. 3 oct. 2025 à 14:41 »), localisé par le catalogue de l'appelant.
    static func listLabel(
        sentAt: Date, timeString: String, now: Date, calendar: Calendar, locale: Locale,
        today: String, yesterday: String, dayBeforeYesterday: String, atWord: String
    ) -> String {
        label(
            sentAt: sentAt, timeString: timeString, now: now, calendar: calendar, locale: locale,
            today: today, yesterday: yesterday, dayBeforeYesterday: dayBeforeYesterday,
            joiner: " \(atWord) ", dateJoiner: " \(atWord) "
        )
    }

    private static func capitalized(_ text: String, locale: Locale) -> String {
        guard let first = text.first else { return text }
        return String(first).uppercased(with: locale) + text.dropFirst()
    }
}
