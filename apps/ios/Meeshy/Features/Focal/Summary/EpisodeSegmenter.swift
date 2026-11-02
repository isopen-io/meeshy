import Foundation

/// Segmentation en épisodes — contrat Focal §WS-8/§3.7. Coupure sur : trou
/// temporel > `gapThreshold` (6 h), OU changement complet de l'ensemble des
/// locuteurs, OU franchissement de jour. Fusion des épisodes
/// < `minEpisodeMessages` (4) dans le voisin le plus proche. Plafond
/// `maxEpisodes` (8) par fusion des plus petits.
///
/// **100 % pur, 100 % testable sans simulateur, 0 % fabriqué** (mission
/// §WS-8) : aucune donnée n'est inventée, chaque épisode reste une partition
/// EXACTE de `messages` (mêmes ids, aucun doublon, aucun trou).
///
/// **« Changement complet de l'ensemble des locuteurs »** (RE-PREUVE — le
/// contrat ne détaille pas l'algorithme au-delà de cette phrase) : interprété
/// comme une fenêtre arrière bornée à `minEpisodeMessages` — si AUCUN des
/// `minEpisodeMessages` derniers messages de l'épisode en cours ne partage
/// l'expéditeur du message entrant, et que l'épisode a déjà atteint cette
/// taille (pour ne pas couper prématurément un épisode encore trop jeune —
/// la fusion des petits épisodes corrige de toute façon un sur-découpage),
/// c'est un changement complet. Choix documenté ici plutôt que supposé
/// silencieusement ; le critère d'acceptation vectorisé (§WS-8 : « ≤ 8
/// épisodes, tous non vides, partition exacte ») reste vrai quelle que soit
/// la précision de cette heuristique, car la fusion + le plafond normalisent
/// le résultat en aval.
///
/// **Titre déterministe** : composé via `MessageDayLabel.label` (fichier LU
/// JAMAIS MODIFIÉ, §1.3 du contrat) — sur `start` ET `end` de l'épisode,
/// `now` étant `end` lui-même (pas l'horloge murale réelle) : un titre
/// calculé aujourd'hui ou demain sur les MÊMES messages doit rendre les MÊMES
/// mots, ce qu'interdirait un `now` glissant (« Hier » deviendrait
/// « Avant-hier » le lendemain). Si `start`/`end` tombent le même jour
/// calendaire, un seul libellé est utilisé (pas de tiret).
nonisolated public enum EpisodeSegmenter {
    public static let gapThreshold: TimeInterval = 6 * 3600
    public static let minEpisodeMessages = 4
    public static let maxEpisodes = 8

    public static func segment(
        messages: [EpisodeInputMessage],
        calendar: Calendar,
        locale: Locale
    ) -> [ConversationEpisode] {
        guard !messages.isEmpty else { return [] }
        let sorted = messages.sorted { $0.createdAt < $1.createdAt }

        let rawGroups = splitIntoRawGroups(sorted, calendar: calendar)
        let merged = mergeSmallGroups(rawGroups, minSize: minEpisodeMessages)
        let capped = capGroups(merged, maxCount: maxEpisodes)

        return capped.map { makeEpisode(from: $0, calendar: calendar, locale: locale) }
    }

    // MARK: - Découpage brut

    private static func splitIntoRawGroups(
        _ sorted: [EpisodeInputMessage],
        calendar: Calendar
    ) -> [[EpisodeInputMessage]] {
        var groups: [[EpisodeInputMessage]] = []
        var current: [EpisodeInputMessage] = [sorted[0]]

        for message in sorted.dropFirst() {
            let previous = current[current.count - 1]
            let gap = message.createdAt.timeIntervalSince(previous.createdAt)
            let crossedDay = !calendar.isDate(message.createdAt, inSameDayAs: previous.createdAt)

            let recentSpeakers = Set(current.suffix(minEpisodeMessages).map(\.senderId))
            let completeSpeakerChange = current.count >= minEpisodeMessages
                && !recentSpeakers.contains(message.senderId)

            if gap > gapThreshold || crossedDay || completeSpeakerChange {
                groups.append(current)
                current = [message]
            } else {
                current.append(message)
            }
        }
        groups.append(current)
        return groups
    }

    // MARK: - Fusion des petits épisodes dans le voisin le plus proche

    private static func mergeSmallGroups(
        _ groups: [[EpisodeInputMessage]],
        minSize: Int
    ) -> [[EpisodeInputMessage]] {
        guard groups.count > 1 else { return groups }
        var result = groups

        while result.count > 1, let idx = result.firstIndex(where: { $0.count < minSize }) {
            let mergeIntoNext: Bool
            if idx == 0 {
                mergeIntoNext = true
            } else if idx == result.count - 1 {
                mergeIntoNext = false
            } else {
                let gapToPrev = result[idx].first!.createdAt.timeIntervalSince(result[idx - 1].last!.createdAt)
                let gapToNext = result[idx + 1].first!.createdAt.timeIntervalSince(result[idx].last!.createdAt)
                mergeIntoNext = gapToNext <= gapToPrev
            }

            if mergeIntoNext {
                result[idx + 1] = result[idx] + result[idx + 1]
            } else {
                result[idx - 1] = result[idx - 1] + result[idx]
            }
            result.remove(at: idx)
        }
        return result
    }

    // MARK: - Plafond, par fusion des plus petits voisins adjacents

    private static func capGroups(
        _ groups: [[EpisodeInputMessage]],
        maxCount: Int
    ) -> [[EpisodeInputMessage]] {
        var result = groups
        while result.count > maxCount {
            var bestIdx = 0
            var bestSize = Int.max
            for i in 0..<(result.count - 1) {
                let combined = result[i].count + result[i + 1].count
                if combined < bestSize {
                    bestSize = combined
                    bestIdx = i
                }
            }
            result[bestIdx] = result[bestIdx] + result[bestIdx + 1]
            result.remove(at: bestIdx + 1)
        }
        return result
    }

    // MARK: - Titre déterministe

    private static func makeEpisode(
        from group: [EpisodeInputMessage],
        calendar: Calendar,
        locale: Locale
    ) -> ConversationEpisode {
        let start = group.first!.createdAt
        let end = group.last!.createdAt

        let startLabel = MessageDayLabel.label(
            for: start, now: end, calendar: calendar, locale: locale,
            today: todayLabel(locale: locale),
            yesterday: yesterdayLabel(locale: locale),
            dayBeforeYesterday: dayBeforeYesterdayLabel(locale: locale)
        )
        let dayPart: String
        if calendar.isDate(start, inSameDayAs: end) {
            dayPart = startLabel
        } else {
            let endLabel = MessageDayLabel.label(
                for: end, now: end, calendar: calendar, locale: locale,
                today: todayLabel(locale: locale),
                yesterday: yesterdayLabel(locale: locale),
                dayBeforeYesterday: dayBeforeYesterdayLabel(locale: locale)
            )
            dayPart = "\(startLabel)–\(endLabel)"
        }

        let title = "\(dayPart) · \(messagesSuffix(count: group.count, locale: locale))"

        return ConversationEpisode(
            id: "\(group.first!.id)_\(group.last!.id)",
            start: start,
            end: end,
            messageIds: group.map(\.id),
            participantIds: Array(Set(group.map(\.senderId))).sorted(),
            deterministicTitle: title,
            agentTitle: nil
        )
    }

    /// Clés `focal.summary.day.*` — i18n neuve de ce workstream (F-087),
    /// aucune clé existante ne couvre ces trois libellés relatifs pour un
    /// TITRE d'épisode (distinct de la pilule de défilement WS-2, dont les
    /// clés sont scopées `reading_mode.pill.*`). Signalées comme MANQUANTES
    /// au rapport de tâche. Trois fonctions plutôt qu'une paramétrée par clé
    /// dynamique : `String(localized:)` veut une chaîne LITTÉRALE à chaque
    /// site d'appel pour rester extractible par l'outillage i18n.
    private static func todayLabel(locale: Locale) -> String {
        String(localized: "focal.summary.day.today", defaultValue: "Aujourd'hui", bundle: .main, locale: locale)
    }

    private static func yesterdayLabel(locale: Locale) -> String {
        String(localized: "focal.summary.day.yesterday", defaultValue: "Hier", bundle: .main, locale: locale)
    }

    private static func dayBeforeYesterdayLabel(locale: Locale) -> String {
        String(localized: "focal.summary.day.day_before_yesterday", defaultValue: "Avant-hier", bundle: .main, locale: locale)
    }

    /// `focal.summary.episode.messages_one` / `.messages_other` — patron
    /// ONE/OTHER explicite (comme `LentilleBridgeFormatter.messagesOneKey`/
    /// `.messagesOtherKey`), pas de pluralisation ICU implicite (aucun
    /// catalogue `.xcstrings` à disposition de ce fichier).
    private static func messagesSuffix(count: Int, locale: Locale) -> String {
        let format = count == 1
            ? String(localized: "focal.summary.episode.messages_one", defaultValue: "%d message", bundle: .main, locale: locale)
            : String(localized: "focal.summary.episode.messages_other", defaultValue: "%d messages", bundle: .main, locale: locale)
        return String(format: format, count)
    }
}
