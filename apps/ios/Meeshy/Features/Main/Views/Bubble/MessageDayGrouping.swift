import Foundation

/// Découpage pur d'une liste de dates en groupes consécutifs partageant la
/// même date locale. Alimente la datasource diffable du collectionView de
/// messages : on insère un séparateur de jour entre chaque groupe.
///
/// La fonction ne réordonne pas l'entrée : elle suppose que l'appelant lui
/// passe les dates dans l'ordre qu'il souhaite voir dans le résultat (en
/// pratique, ordre chronologique croissant ou décroissant selon le besoin).
/// La frontière entre groupes est strictement minuit du calendrier fourni.
enum MessageDayGrouping {

    struct DayGroup: Equatable, Sendable {
        let dayStart: Date
        let indices: [Int]
    }

    static func groupByDay(dates: [Date], calendar: Calendar) -> [DayGroup] {
        guard !dates.isEmpty else { return [] }

        var groups: [DayGroup] = []
        var currentStart: Date = calendar.startOfDay(for: dates[0])
        var currentIndices: [Int] = [0]

        for idx in 1..<dates.count {
            let dayStart = calendar.startOfDay(for: dates[idx])
            if dayStart == currentStart {
                currentIndices.append(idx)
            } else {
                groups.append(DayGroup(dayStart: currentStart, indices: currentIndices))
                currentStart = dayStart
                currentIndices = [idx]
            }
        }
        groups.append(DayGroup(dayStart: currentStart, indices: currentIndices))
        return groups
    }
}
