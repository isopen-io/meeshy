import Foundation

/// Les dates d'un lien d'invitation (création, expiration), écrites dans la
/// langue du lecteur mais TOUJOURS dans le calendrier grégorien.
///
/// Une locale `ar_SA` choisit par défaut le calendrier de l'hégire : « créé le
/// ١٠ ربيع الأول ١٤٤٧ هـ » pour un groupe créé le 2 septembre 2025, pendant
/// que la même page affichait « encore 6 jours » compté en grégorien. L'app
/// date déjà ses stories ainsi (`MyStoryCardPresentation.dateLabel`).
public enum ShareLinkDateFormat {

    public static func day(_ date: Date, locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        date.formatted(style(locale: locale, timeZone: timeZone, time: .omitted))
    }

    public static func dayAndTime(_ date: Date, locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        date.formatted(style(locale: locale, timeZone: timeZone, time: .shortened))
    }

    private static func style(locale: Locale, timeZone: TimeZone, time: Date.FormatStyle.TimeStyle) -> Date.FormatStyle {
        var calendar = Calendar(identifier: .gregorian)
        calendar.locale = locale
        calendar.timeZone = timeZone
        return Date.FormatStyle(date: .abbreviated, time: time, locale: locale, calendar: calendar, timeZone: timeZone)
    }
}
