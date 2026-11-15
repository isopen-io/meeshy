import Foundation
import MeeshySDK

/// L'ancienneté de mon compte, en UNE ligne sous mon nom (#18590) : « Sur Meeshy depuis mars 2026 ». Elle remplace la
/// section « Membre depuis » et la carte « Membre Nj » : le mois et l'année disent l'ancienneté sans demander de lire
/// un compte de jours.
nonisolated enum ProfileMembershipLine {

    /// Une date au-delà de demain n'est pas une inscription mais une donnée corrompue : la ligne se tait plutôt que de
    /// dire un mois faux. Le jour de marge absorbe le décalage d'horloge d'un compte créé à l'instant.
    private static let futureTolerance: TimeInterval = 86_400

    /// `nil` quand rien n'est servi ou lisible : la ligne n'existe pas, elle n'invente aucun mois.
    static func text(createdAt: String?, locale: Locale, now: Date) -> String? {
        guard let createdAt, let date = WireDate.date(from: createdAt),
              date <= now.addingTimeInterval(futureTolerance) else { return nil }
        let format = String(localized: "profile.membership.since", defaultValue: "Sur Meeshy depuis %@", bundle: .main)
        return String(format: format, monthAndYear(of: date, locale: locale))
    }

    private static func monthAndYear(of date: Date, locale: Locale) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.setLocalizedDateFormatFromTemplate("MMMMy")
        return formatter.string(from: date)
    }
}
