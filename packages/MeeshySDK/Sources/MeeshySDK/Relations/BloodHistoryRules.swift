import Foundation

// LA LECTURE DE L'HISTORIQUE D'UN SANG (#18872, planche Carte-Sang) : des fonctions pures sur les points servis. Elles
// disent combien de chemin par jour, ce que montre une fenêtre (aujourd'hui, hier, 7 j, 30 j), combien d'arrêts, et où
// se trouvait la personne à un instant de la lecture. Aucune ne fabrique un point que le serveur n'a pas servi.

/// Les fenêtres que la feuille propose.
public enum BloodHistoryRange: String, CaseIterable, Sendable {
    case today, yesterday, week, month

    /// L'intervalle couvert, en jours civils du calendrier passé (le jour de `now` compris).
    public func interval(now: Date, calendar: Calendar) -> DateInterval {
        let startOfToday = calendar.startOfDay(for: now)
        let day: (Int) -> Date = { offset in calendar.date(byAdding: .day, value: offset, to: startOfToday) ?? startOfToday }
        switch self {
        case .today: return DateInterval(start: startOfToday, end: max(now, startOfToday))
        case .yesterday: return DateInterval(start: day(-1), end: startOfToday)
        case .week: return DateInterval(start: day(-6), end: max(now, startOfToday))
        case .month: return DateInterval(start: day(-(BloodLocationContract.historyDays - 1)), end: max(now, startOfToday))
        }
    }
}

public enum BloodHistoryRules {
    /// Deux relevés à moins de cette distance l'un de l'autre sont « au même endroit ».
    public static let stopRadiusMeters: Double = 120
    /// Un arrêt dure au moins cela.
    public static let stopMinimumDuration: TimeInterval = 10 * 60

    /// Les points de la fenêtre, dans l'ordre du temps.
    public static func points(_ points: [BloodLocationPoint], in interval: DateInterval) -> [BloodLocationPoint] {
        points.filter { interval.contains($0.recordedAt) }.sorted { $0.recordedAt < $1.recordedAt }
    }

    /// Le chemin parcouru le long des points, en mètres.
    public static func distanceMeters(_ points: [BloodLocationPoint]) -> Double {
        zip(points, points.dropFirst()).reduce(0) { total, pair in
            total + LocationMapRules.distanceMeters(fromLatitude: pair.0.latitude, fromLongitude: pair.0.longitude,
                                                    toLatitude: pair.1.latitude, toLongitude: pair.1.longitude)
        }
    }

    /// Le chemin de chacun des `days` derniers jours, du plus ancien (index 0) à aujourd'hui (dernier index).
    public static func dailyDistances(_ points: [BloodLocationPoint], days: Int = BloodLocationContract.historyDays,
                                      now: Date, calendar: Calendar) -> [Double] {
        let startOfToday = calendar.startOfDay(for: now)
        return (0..<max(days, 0)).map { index in
            let offset = index - (days - 1)
            guard let start = calendar.date(byAdding: .day, value: offset, to: startOfToday),
                  let end = calendar.date(byAdding: .day, value: 1, to: start) else { return 0 }
            return distanceMeters(Self.points(points, in: DateInterval(start: start, end: end)))
        }
    }

    /// Les arrêts : des suites de relevés restés dans un même rayon au moins dix minutes. Rend l'index du premier point
    /// de chaque arrêt.
    public static func stops(_ points: [BloodLocationPoint]) -> [Int] {
        var result: [Int] = []
        var anchor = 0
        for index in points.indices.dropFirst() {
            let base = points[anchor]
            let point = points[index]
            let away = LocationMapRules.distanceMeters(fromLatitude: base.latitude, fromLongitude: base.longitude,
                                                       toLatitude: point.latitude, toLongitude: point.longitude)
            guard away > stopRadiusMeters else { continue }
            if points[index - 1].recordedAt.timeIntervalSince(base.recordedAt) >= stopMinimumDuration { result.append(anchor) }
            anchor = index
        }
        if let last = points.last, points.indices.contains(anchor),
           last.recordedAt.timeIntervalSince(points[anchor].recordedAt) >= stopMinimumDuration {
            result.append(anchor)
        }
        return result
    }

    /// Le point montré à la position `progress` (0…1) de la lecture : le dernier relevé à cet instant ou avant.
    public static func index(atProgress progress: Double, in points: [BloodLocationPoint]) -> Int? {
        guard let first = points.first, let last = points.last else { return nil }
        let clamped = progress.isFinite ? min(max(progress, 0), 1) : 0
        let instant = first.recordedAt.addingTimeInterval(clamped * last.recordedAt.timeIntervalSince(first.recordedAt))
        return points.lastIndex { $0.recordedAt <= instant } ?? 0
    }
}
