import Foundation
import MeeshySDK

/// L'ancienneté de mon compte, en UNE ligne sous mon nom (#18590) : « Sur Meeshy depuis mars 2026 ». Elle remplace la
/// section « Membre depuis » et la carte « Membre Nj » : le mois et l'année disent l'ancienneté sans demander de lire
/// un compte de jours. Ma ville déclarée la précède (#19388, planche `Main`) : « Dakar · sur Meeshy depuis mars 2026 ».
nonisolated enum ProfileMembershipLine {

    /// Une date au-delà de demain n'est pas une inscription mais une donnée corrompue : la ligne se tait plutôt que de
    /// dire un mois faux. Le jour de marge absorbe le décalage d'horloge d'un compte créé à l'instant.
    private static let futureTolerance: TimeInterval = 86_400

    /// `nil` quand rien n'est servi ou lisible : la ligne n'existe pas, elle n'invente aucun mois. Sans date, la ville
    /// se dit seule ; sans ville, l'ancienneté seule.
    static func text(city: String? = nil, createdAt: String?, locale: Locale, now: Date) -> String? {
        let declared = ProfileCity.normalized(city)
        guard let month = servedMonth(createdAt: createdAt, locale: locale, now: now) else { return declared }
        guard let place = declared else {
            let format = String(localized: "profile.membership.since", defaultValue: "Sur Meeshy depuis %@", bundle: .main)
            return String(format: format, month)
        }
        let format = String(localized: "profile.membership.cityAndSince", defaultValue: "%1$@ · sur Meeshy depuis %2$@",
                            bundle: .main)
        return String(format: format, place, month)
    }

    private static func servedMonth(createdAt: String?, locale: Locale, now: Date) -> String? {
        guard let createdAt, let date = WireDate.date(from: createdAt),
              date <= now.addingTimeInterval(futureTolerance) else { return nil }
        return monthAndYear(of: date, locale: locale)
    }

    private static func monthAndYear(of date: Date, locale: Locale) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.setLocalizedDateFormatFromTemplate("MMMMy")
        return formatter.string(from: date)
    }
}
