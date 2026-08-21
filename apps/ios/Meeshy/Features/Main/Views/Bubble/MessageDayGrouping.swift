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

    // MARK: - Tête de groupe

    /// Le strict nécessaire pour décider qu'une rangée ouvre un groupe.
    struct GroupCandidate: Equatable, Sendable {
        let senderId: String
        /// Un message SYSTÈME porte l'identifiant de la personne qu'il
        /// concerne — l'avis d'arrivée est écrit avec l'arrivant pour auteur
        /// (`packages/shared/utils/join-notice.ts`).
        let isSystem: Bool
        let createdAt: Date
    }

    /// La rangée ouvre-t-elle un groupe ? Elle porte alors son identité
    /// complète : avatar, nom et heure.
    ///
    /// Décider sur le seul `senderId` faisait suivre la première vraie bulle
    /// d'un nouveau venu dans le groupe de sa propre annonce d'arrivée, avec
    /// le même identifiant — et la rangée perdait ses trois marqueurs d'un
    /// coup. Un message système n'est pas une prise de parole : il forme
    /// toujours son propre groupe et ne continue jamais celui d'un voisin.
    ///
    /// Miroirs de cette règle : `apps/web/utils/message-grouping.ts` et
    /// `apps/android/.../MessageGrouping.kt` — toute évolution touche les trois.
    static func isGroupHead(
        previous: GroupCandidate?,
        current: GroupCandidate,
        calendar: Calendar = .current
    ) -> Bool {
        guard let previous else { return true }
        return !continues(previous, current, calendar: calendar)
    }

    /// La rangée ferme-t-elle un groupe ?
    ///
    /// En mode Bulles, c'est le DERNIER message d'une suite qui porte
    /// l'identité — `BubbleStandardLayout.showIdentityBar` s'accroche à
    /// `isLastInGroup`, et l'espacement bas s'y accroche aussi. Tête et queue
    /// partagent volontairement la même continuité : deux prédicats séparés
    /// dériveraient l'un de l'autre à la première évolution.
    static func isGroupTail(
        current: GroupCandidate,
        next: GroupCandidate?,
        calendar: Calendar = .current
    ) -> Bool {
        guard let next else { return true }
        return !continues(current, next, calendar: calendar)
    }

    /// Deux rangées voisines appartiennent-elles à la même suite ?
    ///
    /// Un message système n'est pas une prise de parole : il n'entre dans
    /// aucune suite, ni comme prédécesseur ni comme successeur. Et deux
    /// expéditeurs sans identifiant ne sont pas la même personne.
    private static func continues(
        _ earlier: GroupCandidate,
        _ later: GroupCandidate,
        calendar: Calendar
    ) -> Bool {
        if earlier.isSystem || later.isSystem { return false }
        guard !earlier.senderId.isEmpty, earlier.senderId == later.senderId else { return false }
        return calendar.isDate(earlier.createdAt, inSameDayAs: later.createdAt)
    }
}
