import Foundation

/// Classement de la Rampe — contrat Focal §WS-8/§3.7. Score UNIQUEMENT sur
/// des signaux réels et vérifiables : mentions de moi non répondues ×5,
/// réponses directes à mes messages ×3, questions sans réponse de cette
/// personne ×2, récence (décroissance sur 7 j) ×1. Le badge affiché EST le
/// nombre de messages qui m'attendent (`awaitingCount`) — jamais le score
/// (`needScore`, réservé au tri, jamais affiché — §3.7).
///
/// `rank(entries:now:)` ne DÉCIDE PAS qui figure sur la Rampe — il classe
/// une liste déjà assemblée. `makeInputs(awaitingYou:participants:)` fait
/// l'assemblage (§WS-8, groupement par `fromUserId` de
/// `DeterministicConversationDigest.awaitingYou`), séparé du classement pour
/// que `rank` reste une fonction pure testable sur des entrées à la main,
/// sans dépendre de la forme du digest.
nonisolated public enum FaceRampRanking {
    public static let mentionWeight: Double = 5
    public static let directReplyWeight: Double = 3
    public static let unansweredQuestionWeight: Double = 2
    public static let recencyWeight: Double = 1
    public static let recencyHalfLife: TimeInterval = 7 * 24 * 3600

    /// Tri : score décroissant, puis nom affiché croissant pour départager
    /// (« Karim d'abord » — critère §7) — comparaison `String` brute (`<`),
    /// jamais `hashValue` ni une collation dépendante d'une locale non
    /// injectée : deux exécutions du même processus, ou de deux processus
    /// différents, rendent le même ordre.
    public static func rank(entries: [FaceRampRankingInput], now: Date) -> [FaceRampEntry] {
        entries
            .map { entry -> FaceRampEntry in
                let evidence = orderedUnique(
                    entry.mentionEvidence + entry.directReplyEvidence + entry.unansweredQuestionEvidence
                )
                let score = mentionWeight * Double(entry.mentionEvidence.count)
                    + directReplyWeight * Double(entry.directReplyEvidence.count)
                    + unansweredQuestionWeight * Double(entry.unansweredQuestionEvidence.count)
                    + recencyWeight * recencyScore(entry.mostRecentEvidenceAt, now: now)

                return FaceRampEntry(
                    id: entry.id,
                    displayName: entry.displayName,
                    avatarURL: entry.avatarURL,
                    colorHex: entry.colorHex,
                    presence: entry.presence,
                    awaitingCount: evidence.count,
                    needScore: score,
                    evidenceMessageIds: evidence
                )
            }
            .sorted { lhs, rhs in
                if lhs.needScore != rhs.needScore { return lhs.needScore > rhs.needScore }
                return lhs.displayName < rhs.displayName
            }
    }

    /// Décroissance exponentielle demi-vie 7 j : `0.5 ^ (écoulé / demi-vie)`.
    /// `nil`/passé négatif (horloge injectée incohérente) ⇒ `0`, jamais un
    /// score négatif ni `NaN`.
    private static func recencyScore(_ at: Date?, now: Date) -> Double {
        guard let at else { return 0 }
        let elapsed = max(0, now.timeIntervalSince(at))
        return pow(0.5, elapsed / recencyHalfLife)
    }

    private static func orderedUnique(_ ids: [String]) -> [String] {
        var seen = Set<String>()
        var result: [String] = []
        for id in ids where !seen.contains(id) {
            seen.insert(id)
            result.append(id)
        }
        return result
    }

    // MARK: - Assemblage depuis le digest

    /// Groupe `awaitingYou` par `fromUserId` et résout l'identité via
    /// `participants`. Un `fromUserId` ABSENT de `participants` est
    /// SILENCIEUSEMENT écarté — zéro donnée fabriquée (contrat §6.3,
    /// interdit 1) : afficher une entrée de Rampe exige un nom et un avatar
    /// réels, jamais un placeholder inventé pour un identifiant inconnu.
    public static func makeInputs(
        awaitingYou: [AwaitingItem],
        participants: [DigestParticipant]
    ) -> [FaceRampRankingInput] {
        struct Bucket {
            var mention: [String] = []
            var reply: [String] = []
            var question: [String] = []
            var mostRecent: Date?
        }

        var byUser: [String: Bucket] = [:]
        for item in awaitingYou {
            var bucket = byUser[item.fromUserId] ?? Bucket()
            switch item.kind {
            case .mention: bucket.mention.append(contentsOf: item.evidenceMessageIds)
            case .directReply: bucket.reply.append(contentsOf: item.evidenceMessageIds)
            case .unansweredQuestion: bucket.question.append(contentsOf: item.evidenceMessageIds)
            }
            bucket.mostRecent = max(bucket.mostRecent ?? .distantPast, item.at)
            byUser[item.fromUserId] = bucket
        }

        let participantsById = Dictionary(uniqueKeysWithValues: participants.map { ($0.id, $0) })

        return byUser
            .compactMap { userId, bucket -> FaceRampRankingInput? in
                guard let participant = participantsById[userId] else { return nil }
                return FaceRampRankingInput(
                    id: userId,
                    displayName: participant.displayName,
                    avatarURL: participant.avatarURL,
                    colorHex: participant.colorHex,
                    presence: participant.presence,
                    mentionEvidence: bucket.mention,
                    directReplyEvidence: bucket.reply,
                    unansweredQuestionEvidence: bucket.question,
                    mostRecentEvidenceAt: bucket.mostRecent
                )
            }
            .sorted { $0.id < $1.id } // ordre déterministe AVANT `rank` (qui retriera par score)
    }
}
