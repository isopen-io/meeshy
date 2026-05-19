import Foundation

/// Logique pure de labellisation d'un séparateur de jour pour la liste des
/// messages. Renvoie un texte humain (fr_FR par défaut) à afficher dans la
/// pill flottante qui sépare les groupes de messages d'un même jour.
///
/// Contrat (Prisme UX, convention WhatsApp/iMessage adaptée) :
///   - même jour calendaire que `now`         → "Aujourd'hui"
///   - J-1                                    → "Hier"
///   - J-2                                    → "Avant-hier"
///   - J-3 à J-6                              → jour de semaine ("Lundi")
///   - J-7+ même année                        → "Lundi 9 mai"
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
        locale: Locale
    ) -> String {
        let startOfToday = calendar.startOfDay(for: now)
        let startOfTarget = calendar.startOfDay(for: date)
        let daysDiff = calendar.dateComponents([.day], from: startOfTarget, to: startOfToday).day ?? 0

        // Une date au futur le même jour calendaire reste "Aujourd'hui" —
        // tolérance pour un horodatage client en avance de quelques minutes.
        if daysDiff <= 0 {
            return "Aujourd'hui"
        }

        switch daysDiff {
        case 1: return "Hier"
        case 2: return "Avant-hier"
        case 3...6: return weekdayName(date, calendar: calendar, locale: locale)
        default:
            let sameYear = calendar.component(.year, from: date) == calendar.component(.year, from: now)
            return fullDate(date, calendar: calendar, locale: locale, includeYear: !sameYear)
        }
    }

    // MARK: - Helpers

    private static func weekdayName(_ date: Date, calendar: Calendar, locale: Locale) -> String {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = locale
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "EEEE"
        return formatter.string(from: date).firstLetterUppercased(locale: locale)
    }

    private static func fullDate(_ date: Date, calendar: Calendar, locale: Locale, includeYear: Bool) -> String {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = locale
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = includeYear ? "EEEE d MMMM yyyy" : "EEEE d MMMM"
        return formatter.string(from: date).firstLetterUppercased(locale: locale)
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
