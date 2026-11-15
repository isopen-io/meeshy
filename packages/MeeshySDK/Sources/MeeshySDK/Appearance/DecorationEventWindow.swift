import Foundation

/// Comment revient l'événement d'une décoration (#16450) : chaque année, ou une seule fois.
public enum DecorationEventRecurrence: String, Codable, Sendable, Hashable {
    case yearly
    case none
}

/// La déclaration `event` d'un pack de décoration, telle que le catalogue d'apparence la transmet (#16450).
///
/// Annuelle : `{ id, recurrence: "yearly", startsOn?, endsOn? }` — des bornes écrites en mois-jour (`MM-DD`).
/// Unique : `{ id, year }`.
public struct DecorationEventDeclaration: Codable, Sendable, Hashable {
    public let id: String
    public let recurrence: DecorationEventRecurrence
    public let year: Int?
    public let startsOn: String?
    public let endsOn: String?

    public init(id: String, recurrence: DecorationEventRecurrence, year: Int? = nil, startsOn: String? = nil, endsOn: String? = nil) {
        self.id = id
        self.recurrence = recurrence
        self.year = year
        self.startsOn = startsOn
        self.endsOn = endsOn
    }

    private enum CodingKeys: String, CodingKey { case id, recurrence, year, startsOn, endsOn }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        recurrence = try c.decodeIfPresent(DecorationEventRecurrence.self, forKey: .recurrence) ?? .none
        year = try c.decodeIfPresent(Int.self, forKey: .year)
        startsOn = try c.decodeIfPresent(String.self, forKey: .startsOn)
        endsOn = try c.decodeIfPresent(String.self, forKey: .endsOn)
    }
}

/// Une fenêtre d'offre : `startsAt` inclus, `endsAt` exclu.
public struct DecorationWindow: Sendable, Hashable {
    public let startsAt: Date
    public let endsAt: Date

    public init(startsAt: Date, endsAt: Date) {
        self.startsAt = startsAt
        self.endsAt = endsAt
    }

    public func isOpen(at now: Date) -> Bool { now >= startsAt && now < endsAt }
}

/// LA FENÊTRE D'UNE DÉCORATION D'ÉVÉNEMENT — miroir Swift de `resolveEventWindow`
/// (`packages/shared/utils/decoration-event-window.ts`, #16447, #16450) ; le Kotlin a le sien
/// (`DecorationEventWindow.kt`). Toute évolution touche les TROIS.
///
/// De deux mois calendaires avant l'événement à un mois après, en UTC ; des bornes écrites priment.
/// Un jour sans équivalent dans le mois visé est borné au dernier jour de ce mois (le 29 février d'une
/// année commune devient le 28). Pour un événement annuel : l'occurrence EN COURS, sinon la PROCHAINE.
public enum DecorationEventWindow {
    public static let monthsBeforeEvent = 2
    public static let monthsAfterEvent = 1

    public struct EventDate: Sendable, Hashable {
        public let month: Int
        public let day: Int
        public init(month: Int, day: Int) {
            self.month = month
            self.day = day
        }
    }

    /// Le registre partagé, ids en anglais.
    public static let events: [String: EventDate] = [
        "christmas": EventDate(month: 12, day: 25),
        "new-year": EventDate(month: 1, day: 1),
        "valentines-day": EventDate(month: 2, day: 14),
        "music-day": EventDate(month: 6, day: 21),
        "halloween": EventDate(month: 10, day: 31),
    ]

    /// La fenêtre de l'événement à `now` ; `nil` si l'événement est inconnu ou une borne illisible
    /// (le lecteur garde alors la fenêtre servie).
    public static func resolve(_ event: DecorationEventDeclaration, now: Date) -> DecorationWindow? {
        guard let date = events[event.id] else { return nil }
        guard event.recurrence == .yearly else {
            return event.year.map { ruleWindow(date: date, year: $0) }
        }
        let starts = event.startsOn.map(parseMonthDay)
        let ends = event.endsOn.map(parseMonthDay)
        if starts == .some(nil) || ends == .some(nil) { return nil }
        let year = utc.component(.year, from: now)
        let windows = (year - 1...year + 2).map { yearlyWindow(date: date, year: $0, startsOn: starts ?? nil, endsOn: ends ?? nil) }
        return windows.first { $0.endsAt > now } ?? windows.last
    }

    /// La fenêtre que la règle donne à l'occurrence `year` d'un événement.
    public static func ruleWindow(date: EventDate, year: Int) -> DecorationWindow {
        DecorationWindow(
            startsAt: clampedDay(year: year, monthIndex: date.month - 1 - monthsBeforeEvent, day: date.day),
            endsAt: clampedDay(year: year, monthIndex: date.month - 1 + monthsAfterEvent, day: date.day)
        )
    }

    /// La fenêtre d'OFFRE : un événement annuel se recalcule à `now`, sinon la fenêtre servie fait foi.
    public static func offerWindow(event: DecorationEventDeclaration?, served: DecorationWindow?, now: Date) -> DecorationWindow? {
        guard let event, event.recurrence == .yearly, let resolved = resolve(event, now: now) else { return served }
        return resolved
    }

    private static func yearlyWindow(date: EventDate, year: Int, startsOn: EventDate?, endsOn: EventDate?) -> DecorationWindow {
        let eventDay = clampedDay(year: year, monthIndex: date.month - 1, day: date.day)
        let rule = ruleWindow(date: date, year: year)
        let start = startsOn.map { bound -> Date in
            let same = clampedDay(year: year, monthIndex: bound.month - 1, day: bound.day)
            return same <= eventDay ? same : clampedDay(year: year - 1, monthIndex: bound.month - 1, day: bound.day)
        } ?? rule.startsAt
        let end = endsOn.map { bound -> Date in
            let same = clampedDay(year: year, monthIndex: bound.month - 1, day: bound.day)
            return same > eventDay ? same : clampedDay(year: year + 1, monthIndex: bound.month - 1, day: bound.day)
        } ?? rule.endsAt
        return DecorationWindow(startsAt: start, endsAt: end)
    }

    private static let utc: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? TimeZone(secondsFromGMT: 0) ?? .current
        return calendar
    }()

    private static func isLeap(_ year: Int) -> Bool { (year % 4 == 0 && year % 100 != 0) || year % 400 == 0 }

    private static func daysInMonth(year: Int, month: Int) -> Int {
        switch month {
        case 2: return isLeap(year) ? 29 : 28
        case 4, 6, 9, 11: return 30
        default: return 31
        }
    }

    /// Minuit UTC du jour, borné au dernier jour du mois ; `monthIndex` (0 = janvier) peut déborder d'une année.
    static func clampedDay(year: Int, monthIndex: Int, day: Int) -> Date {
        let shift = monthIndex >= 0 ? monthIndex / 12 : (monthIndex - 11) / 12
        let y = year + shift
        let m = monthIndex - shift * 12 + 1
        let components = DateComponents(year: y, month: m, day: min(day, daysInMonth(year: y, month: m)))
        return utc.date(from: components) ?? Date(timeIntervalSince1970: 0)
    }

    private static func parseMonthDay(_ value: String) -> EventDate? {
        let parts = value.split(separator: "-")
        guard parts.count == 2, parts[0].count == 2, parts[1].count == 2,
              let month = Int(parts[0]), let day = Int(parts[1]),
              (1...12).contains(month), (1...31).contains(day) else { return nil }
        return EventDate(month: month, day: day)
    }
}
