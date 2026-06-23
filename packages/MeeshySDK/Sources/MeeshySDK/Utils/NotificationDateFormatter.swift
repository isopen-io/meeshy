import Foundation

/// Horodatage « intelligent » dédié aux SOUS-TITRES de notification : précise
/// QUAND le contenu lié (story / post / réel…) a été publié, distinct de
/// l'horodatage d'arrivée de la notification affiché à droite de la ligne.
///
/// Décision produit 2026-06-23 (refonte précision notifications) :
/// - récent      → relatif : `à l'instant` / `il y a 6 min` / `il y a 3 h`
/// - hier        → `hier 14:30`
/// - au-delà     → date absolue locale + heure : `23/06/2026 14:30`
///
/// Pourquoi un formateur dédié et non `RelativeTimeFormatter` : ce dernier ne
/// porte JAMAIS l'heure (« hier », « 23 juin ») — or l'utilisateur veut
/// l'horaire précis du contenu (« du JJ/MM/AAAA HH:MM »). Les libellés relatifs
/// passent par le catalogue de l'app (`Bundle.main`, clés `notification.date.*`)
/// avec repli français pour les tests SDK ; la date+heure absolue suit
/// `Locale.current` (format régional) et le fuseau de l'appareil.
///
/// Pur et déterministe : `now` et `calendar` sont injectables pour les tests.
public enum NotificationDateFormatter {
    public static func string(
        for date: Date,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> String {
        let seconds = Int(now.timeIntervalSince(date))

        // Futur ou < 1 min → « à l'instant » (robuste aux légers décalages d'horloge).
        if seconds < 60 { return nowLabel }
        if seconds < 3_600 { return ago(minutesLabel(seconds / 60)) }

        let dayDelta = calendar.dateComponents(
            [.day],
            from: calendar.startOfDay(for: date),
            to: calendar.startOfDay(for: now)
        ).day ?? 0

        if dayDelta <= 0 { return ago(hoursLabel(seconds / 3_600)) }
        if dayDelta == 1 {
            return String(format: yesterdayAtLabel, formatters.time(from: date, timeZone: calendar.timeZone))
        }
        return formatters.dateTime(from: date, timeZone: calendar.timeZone)
    }

    // MARK: - Libellés relatifs localisés (catalogue app, repli FR)

    private static var nowLabel: String {
        String(localized: "notification.date.now", defaultValue: "à l’instant", bundle: .main)
    }
    private static func minutesLabel(_ m: Int) -> String {
        String(format: String(localized: "notification.date.minutes", defaultValue: "%lld min", bundle: .main), m)
    }
    private static func hoursLabel(_ h: Int) -> String {
        String(format: String(localized: "notification.date.hours", defaultValue: "%lld h", bundle: .main), h)
    }
    private static func ago(_ label: String) -> String {
        String(format: String(localized: "notification.date.ago", defaultValue: "il y a %@", bundle: .main), label)
    }
    private static var yesterdayAtLabel: String {
        String(localized: "notification.date.yesterdayAt", defaultValue: "hier %@", bundle: .main)
    }

    private static let formatters = NotificationDateFormatterBox()
}

/// Boîte `DateFormatter` thread-safe (`DateFormatter.string(from:)` n'est pas
/// thread-safe), même pattern que `RelativeTimeFormatter`. Le fuseau est appliqué
/// par appel pour rester cohérent avec le calendrier (UTC en tests, local en prod).
private final class NotificationDateFormatterBox: @unchecked Sendable {
    private let lock = NSLock()
    private let dateTimeFormatter: DateFormatter
    private let timeFormatter: DateFormatter

    init() {
        let locale = Locale.current
        // `setLocalizedDateFormatFromTemplate` réordonne selon la locale :
        // fr → "23/06/2026 14:30", en → "06/23/2026 2:30 PM".
        dateTimeFormatter = DateFormatter()
        dateTimeFormatter.locale = locale
        dateTimeFormatter.setLocalizedDateFormatFromTemplate("ddMMyyyy HHmm")
        timeFormatter = DateFormatter()
        timeFormatter.locale = locale
        timeFormatter.setLocalizedDateFormatFromTemplate("HHmm")
    }

    func dateTime(from date: Date, timeZone: TimeZone) -> String {
        lock.lock(); defer { lock.unlock() }
        dateTimeFormatter.timeZone = timeZone
        return dateTimeFormatter.string(from: date)
    }

    func time(from date: Date, timeZone: TimeZone) -> String {
        lock.lock(); defer { lock.unlock() }
        timeFormatter.timeZone = timeZone
        return timeFormatter.string(from: date)
    }
}
