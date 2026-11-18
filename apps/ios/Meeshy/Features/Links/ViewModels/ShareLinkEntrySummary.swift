import Foundation
import MeeshySDK

// MARK: - Les entrées d'un lien de partage (planche `Lien-Partage`, #18871)

/// La jauge des entrées : combien sont entrés, sur combien de places. Sans limite, il n'y a ni part ni reste.
nonisolated struct ShareLinkEntryQuota: Equatable, Sendable {
    let used: Int
    let limit: Int?

    init(used: Int, limit: Int?) {
        self.used = max(used, 0)
        self.limit = limit.flatMap { $0 > 0 ? $0 : nil }
    }

    init(link: MyShareLink) {
        self.init(used: link.currentUses, limit: link.maxUses)
    }

    /// La part du quota remplie, bornée de 0 à 1 ; `nil` sans limite.
    var fraction: Double? {
        limit.map { min(Double(used) / Double($0), 1) }
    }

    /// La part en pour cent, arrondie ; `nil` sans limite.
    var percent: Int? {
        fraction.map { Int(($0 * 100).rounded()) }
    }

    /// Les places qui restent, jamais négatives ; `nil` sans limite.
    var remaining: Int? {
        limit.map { max($0 - used, 0) }
    }

    var isFull: Bool { remaining == 0 }
}

/// L'échéance d'un lien, dite en jours : la pastille de la jauge (« expire dans 6 jours »).
nonisolated enum ShareLinkExpiry: Equatable, Sendable {
    case never
    case today
    case inDays(Int)
    case expired

    static func resolve(expiresAt: Date?, now: Date, calendar: Calendar) -> ShareLinkExpiry {
        guard let expiresAt else { return .never }
        guard expiresAt > now else { return .expired }
        let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: now),
                                           to: calendar.startOfDay(for: expiresAt)).day ?? 0
        return days <= 0 ? .today : .inDays(days)
    }

    /// Une semaine ou moins : la pastille passe à la teinte d'avertissement.
    var isSoon: Bool {
        switch self {
        case .today: return true
        case .inDays(let days): return days <= 7
        case .never, .expired: return false
        }
    }
}

/// « Qui peut entrer » : une puce par règle d'entrée, dans l'ordre de la planche.
/// Les droits des invités ne se disent que si un invité sans compte peut entrer.
nonisolated enum ShareLinkEntryRule: Hashable, Sendable {
    case guestsWithoutAccount
    case accountRequired
    case askedFields
    case historyVisible
    case guestMessages
    case guestImages
    case guestFiles
    case concurrentLimit(Int)
    case allLanguages
    case languages([String])

    static func rules(for settings: ShareLinkSettings) -> [ShareLinkEntryRule] {
        let access: [ShareLinkEntryRule] = settings.requireAccount ? [.accountRequired] : [.guestsWithoutAccount]
        let asked: [ShareLinkEntryRule] = askedFieldsPresent(settings) ? [.askedFields] : []
        let history: [ShareLinkEntryRule] = settings.guestRights.history ? [.historyVisible] : []
        let guestRights = settings.requireAccount ? [] : guestRightRules(settings.guestRights)
        let concurrent: [ShareLinkEntryRule] = settings.maxConcurrentUsers.map { [.concurrentLimit($0)] } ?? []
        let languages: [ShareLinkEntryRule] = settings.allowedLanguages.isEmpty
            ? [.allLanguages] : [.languages(settings.allowedLanguages)]
        return access + asked + history + guestRights + concurrent + languages
    }

    private static func askedFieldsPresent(_ settings: ShareLinkSettings) -> Bool {
        settings.requireNickname || settings.requireEmail || settings.requireBirthday
    }

    private static func guestRightRules(_ rights: ShareLinkGuestRights) -> [ShareLinkEntryRule] {
        [rights.messages ? ShareLinkEntryRule.guestMessages : nil,
         rights.images ? .guestImages : nil,
         rights.files ? .guestFiles : nil].compactMap { $0 }
    }
}

/// Une rangée de « Arrivées par pays » : le code du pays, son compte, et sa part de la plus grande rangée.
nonisolated struct ShareLinkCountryShare: Equatable, Sendable {
    let country: String
    let count: Int
    let share: Double

    static let shown = 4

    /// Les quatre pays qui ont fait venir le plus de monde, du plus grand au plus petit ; la barre
    /// du premier est pleine, les autres s'y mesurent.
    static func top(_ counts: [ShareLinkArrivalStats.CountryCount]) -> [ShareLinkCountryShare] {
        let sorted = counts.filter { $0.count > 0 }
            .sorted { $0.count != $1.count ? $0.count > $1.count : $0.country < $1.country }
        guard let largest = sorted.first?.count else { return [] }
        return sorted.prefix(shown).map {
            ShareLinkCountryShare(country: $0.country, count: $0.count, share: Double($0.count) / Double(largest))
        }
    }

    static func countryCount(_ counts: [ShareLinkArrivalStats.CountryCount]) -> Int {
        counts.filter { $0.count > 0 }.count
    }
}

extension ShareLinkArrivalStats {
    /// Les statistiques sans une arrivée retirée : la rangée part, les comptes descendent d'un cran.
    nonisolated func removingArrival(_ participantId: String) -> ShareLinkArrivalStats {
        guard let removed = recentArrivals.first(where: { $0.participantId == participantId }) else { return self }
        return ShareLinkArrivalStats(
            visits: visits,
            arrivals: max(arrivals - 1, 0),
            anonymousArrivals: removed.isAnonymous ? max(anonymousArrivals - 1, 0) : anonymousArrivals,
            arrivalsByLanguage: arrivalsByLanguage,
            arrivalsByCountry: arrivalsByCountry,
            recentArrivals: recentArrivals.filter { $0.participantId != participantId }
        )
    }
}
