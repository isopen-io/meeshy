package me.meeshy.sdk.model.reading.summary

import java.time.Duration
import java.time.Instant
import kotlin.math.pow

/**
 * Classement de la Rampe — miroir de `FaceRampRanking.swift`. Score = 5 par mention non
 * répondue + 3 par réponse directe + 2 par question sans réponse + récence (demi-vie 7 jours).
 * Le badge affiché est [FaceRampEntry.awaitingCount], jamais le score. Tri : score décroissant
 * puis nom croissant (comparaison brute, sans collation de locale).
 */
object FaceRampRanking {
    const val MENTION_WEIGHT = 5.0
    const val DIRECT_REPLY_WEIGHT = 3.0
    const val UNANSWERED_QUESTION_WEIGHT = 2.0
    const val RECENCY_WEIGHT = 1.0
    val RECENCY_HALF_LIFE: Duration = Duration.ofDays(7)

    fun rank(entries: List<FaceRampRankingInput>, now: Instant): List<FaceRampEntry> =
        entries.map { entry ->
            val evidence = (entry.mentionEvidence + entry.directReplyEvidence + entry.unansweredQuestionEvidence).distinct()
            val score = MENTION_WEIGHT * entry.mentionEvidence.size +
                DIRECT_REPLY_WEIGHT * entry.directReplyEvidence.size +
                UNANSWERED_QUESTION_WEIGHT * entry.unansweredQuestionEvidence.size +
                RECENCY_WEIGHT * recencyScore(entry.mostRecentEvidenceAt, now)
            FaceRampEntry(
                id = entry.id, displayName = entry.displayName, avatarUrl = entry.avatarUrl,
                colorHex = entry.colorHex, presence = entry.presence, awaitingCount = evidence.size,
                needScore = score, evidenceMessageIds = evidence, ring = entry.ring,
            )
        }.sortedWith(compareByDescending<FaceRampEntry> { it.needScore }.thenBy { it.displayName })

    /** `0,5 ^ (écoulé / demi-vie)` ; absent ou futur ⇒ 0 écoulé borné, jamais négatif ni NaN. */
    private fun recencyScore(at: Instant?, now: Instant): Double {
        if (at == null) return 0.0
        val elapsedSeconds = maxOf(0.0, Duration.between(at, now).toMillis() / 1000.0)
        return 0.5.pow(elapsedSeconds / (RECENCY_HALF_LIFE.seconds.toDouble()))
    }

    /**
     * Groupe [awaitingYou] par expéditeur et résout l'identité via [participants]. Un expéditeur
     * absent du roster est écarté : aucune identité fabriquée. Sortie triée par id.
     */
    fun makeInputs(awaitingYou: List<AwaitingItem>, participants: List<DigestParticipant>): List<FaceRampRankingInput> {
        val byId = participants.groupBy { it.id }.mapValues { it.value.first() }
        return awaitingYou.groupBy { it.fromUserId }
            .mapNotNull { (userId, items) ->
                val participant = byId[userId] ?: return@mapNotNull null
                fun evidence(kind: AwaitingKind) = items.filter { it.kind == kind }.flatMap { it.evidenceMessageIds }
                FaceRampRankingInput(
                    id = userId, displayName = participant.displayName, avatarUrl = participant.avatarUrl,
                    colorHex = participant.colorHex, presence = participant.presence,
                    mentionEvidence = evidence(AwaitingKind.MENTION),
                    directReplyEvidence = evidence(AwaitingKind.DIRECT_REPLY),
                    unansweredQuestionEvidence = evidence(AwaitingKind.UNANSWERED_QUESTION),
                    mostRecentEvidenceAt = items.maxOf { it.at },
                    ring = participant.ring,
                )
            }
            .sortedBy { it.id }
    }
}
