import Foundation

/// « 🔥 3 · N (M) » d'une conversation, pour le LECTEUR (#8906) — miroir de
/// `ConversationEngagementSnapshot` (`packages/shared/types/engagement-scale.ts`).
///
/// Servi par la liste et le détail de conversation (`viewerEngagement`, absent
/// tant que le lecteur n'a rien gagné là), et poussé au seul lecteur crédité par
/// `engagement:conversation-updated`. Un instantané peut dater d'hier :
/// `forDay(_:)` le projette sur le jour affiché, comme
/// `conversationEngagementForDay` côté TypeScript.
public struct ConversationEngagementSnapshot: Codable, Hashable, Sendable {
    public let conversationId: String
    /// N — points rapportés par cette conversation, depuis toujours.
    public let totalPoints: Int
    /// M — points rapportés aujourd'hui (jour `day`).
    public let todayPoints: Int
    /// Jours civils consécutifs avec au moins un geste crédité ici.
    public let streakDays: Int
    /// Jour civil (`YYYY-MM-DD`, fuseau du lecteur) du dernier geste crédité ; `nil` si jamais.
    public let day: String?

    public init(conversationId: String, totalPoints: Int, todayPoints: Int, streakDays: Int, day: String?) {
        self.conversationId = conversationId
        self.totalPoints = totalPoints
        self.todayPoints = todayPoints
        self.streakDays = streakDays
        self.day = day
    }

    /// Ce qu'on AFFICHE le jour `today` : les points du jour retombent à 0 dès
    /// que `day` n'est plus `today` ; la série tombe à 0 quand le dernier geste
    /// date d'avant-hier ou plus (hier, elle tient encore).
    public func forDay(_ today: String) -> ConversationEngagementSnapshot {
        guard let day, let last = Self.dayNumber(day), let current = Self.dayNumber(today) else {
            return with(todayPoints: 0, streakDays: 0)
        }
        let gap = current - last
        return with(
            todayPoints: gap == 0 ? todayPoints : 0,
            streakDays: gap <= 1 ? streakDays : 0
        )
    }

    /// « N (M) » — `formatConversationPoints` ; la flamme et la série se rendent à côté.
    public var pointsText: String {
        "\(totalPoints) (\(todayPoints))"
    }

    /// Deux instantanés d'une même conversation arrivent par deux chemins (REST,
    /// socket) sans ordre garanti : le plus récent est celui du jour le plus
    /// tardif, puis, le même jour, celui qui a cumulé le plus de points — un
    /// cache relu après un événement temps réel ne le fait pas reculer.
    public func isFresher(than other: ConversationEngagementSnapshot) -> Bool {
        let mine = day ?? ""
        let theirs = other.day ?? ""
        if mine != theirs { return mine > theirs }
        return totalPoints > other.totalPoints
    }

    /// Le jour civil `YYYY-MM-DD` de `date` dans le calendrier du lecteur.
    public static func dayString(for date: Date, calendar: Calendar = .current) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04ld-%02ld-%02ld", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    private func with(todayPoints: Int, streakDays: Int) -> ConversationEngagementSnapshot {
        ConversationEngagementSnapshot(
            conversationId: conversationId,
            totalPoints: totalPoints,
            todayPoints: todayPoints,
            streakDays: streakDays,
            day: day
        )
    }

    /// Jours depuis le 1970-01-01 d'un `YYYY-MM-DD` (calendrier grégorien
    /// proleptique, sans fuseau) ; `nil` si la chaîne n'a pas cette forme.
    static func dayNumber(_ value: String) -> Int? {
        let fields = value.split(separator: "-", omittingEmptySubsequences: false)
        guard fields.count == 3,
              fields[0].count == 4, fields[1].count == 2, fields[2].count == 2,
              fields.allSatisfy({ $0.allSatisfy(\.isASCIIDigit) }),
              let year = Int(fields[0]), let month = Int(fields[1]), let day = Int(fields[2]),
              (1...12).contains(month), (1...31).contains(day)
        else { return nil }
        let shiftedYear = month <= 2 ? year - 1 : year
        let era = (shiftedYear >= 0 ? shiftedYear : shiftedYear - 399) / 400
        let yearOfEra = shiftedYear - era * 400
        let dayOfYear = (153 * (month > 2 ? month - 3 : month + 9) + 2) / 5 + day - 1
        let dayOfEra = yearOfEra * 365 + yearOfEra / 4 - yearOfEra / 100 + dayOfYear
        return era * 146_097 + dayOfEra - 719_468
    }
}

private extension Character {
    var isASCIIDigit: Bool { isASCII && isNumber }
}
