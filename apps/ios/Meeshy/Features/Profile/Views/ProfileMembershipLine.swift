import Foundation
import MeeshySDK
import MeeshyUI

/// Ce que ma vitrine dit sous mon nom (#19987) : « @pseudo · depuis novembre 2026 » en UNE ligne, par la loi de toutes
/// les fiches (`ProfileHandleLine`) ; dans la barre repliée, le seul @pseudo. Ma ville déclarée (#19388) se lit plus bas,
/// seule : l'ancienneté n'a plus de ligne à elle.
nonisolated enum ProfileMembershipLine {

    /// Une date au-delà de demain n'est pas une inscription mais une donnée corrompue : la ligne se tait plutôt que de
    /// dire un mois faux. Le jour de marge absorbe le décalage d'horloge d'un compte créé à l'instant.
    private static let futureTolerance: TimeInterval = 86_400

    /// Le @pseudo, suivi de l'ancienneté quand elle est servie et lisible — jamais un mois inventé.
    ///
    /// `@MainActor` : `ProfileHandleLine.text` l'est (accès à `.module`, #20012) ; son seul appelant
    /// (`ProfileView`) est déjà une `View`, donc déjà MainActor.
    @MainActor
    static func handle(username: String, createdAt: String?, locale: Locale, now: Date, inBar: Bool = false) -> String {
        ProfileHandleLine.text(username: username, memberSince: servedDate(createdAt: createdAt, now: now),
                               locale: locale, inBar: inBar)
    }

    /// Ma ville déclarée, seule ; `nil` quand rien n'est déclaré.
    static func city(_ city: String?) -> String? {
        ProfileCity.normalized(city)
    }

    private static func servedDate(createdAt: String?, now: Date) -> Date? {
        guard let createdAt, let date = WireDate.date(from: createdAt),
              date <= now.addingTimeInterval(futureTolerance) else { return nil }
        return date
    }
}
