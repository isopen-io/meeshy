package me.meeshy.sdk.model.net

import java.time.Instant
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException

/**
 * Les DÉCISIONS de réessai du pipeline HTTP, sans état et sans réseau — miroir de
 * `APIRetryPolicy` (iOS, `APIRequestPipeline.swift`). L'intercepteur ne fait
 * qu'enchaîner ces réponses ; elles s'éprouvent donc sans serveur.
 *
 * [attempt] compte les réessais DÉJÀ faits : 0 devant la première réponse, 3 devant
 * la quatrième, qui remonte telle quelle à l'appelant.
 */
public object RetryDecision {

    public const val MAX_ATTEMPTS: Int = 3
    public const val RETRY_AFTER_CEILING_MILLIS: Long = 30_000L

    public val RETRYABLE_STATUS_CODES: Set<Int> = setOf(429, 503)

    /**
     * Une limite QUOTIDIENNE de gestes tient jusqu'à `resetAt`, et le mode lent des
     * nouveaux comptes se DIT à l'auteur : ni l'un ni l'autre ne se rejoue en silence.
     */
    public val NEVER_REPLAYED_429_CODES: Set<String> = setOf(
        "DAILY_COMMENT_LIMIT",
        "DAILY_REACTION_LIMIT",
        "NEWCOMER_SLOW_MODE",
    )

    public fun shouldRetry(
        statusCode: Int,
        attempt: Int,
        policy: EndpointRetryPolicy,
        refusalCode: String? = null,
    ): Boolean =
        policy == EndpointRetryPolicy.STANDARD &&
            statusCode in RETRYABLE_STATUS_CODES &&
            attempt < MAX_ATTEMPTS &&
            !(statusCode == 429 && refusalCode in NEVER_REPLAYED_429_CODES)

    /**
     * Délai avant le prochain essai, en millisecondes, ou `null` quand on ne rejoue pas.
     * `Retry-After` (entier, décimal ou date HTTP) plafonné à 30 s ; absent, négatif ou
     * illisible, `2^attempt` secondes.
     */
    public fun delayMillis(
        statusCode: Int,
        attempt: Int,
        retryAfter: String?,
        nowEpochMillis: Long,
    ): Long? {
        if (statusCode !in RETRYABLE_STATUS_CODES || attempt >= MAX_ATTEMPTS) return null
        val served = retryAfter?.trim()?.let { parseRetryAfterMillis(it, nowEpochMillis) }
        return served?.coerceIn(0L, RETRY_AFTER_CEILING_MILLIS) ?: backoffMillis(attempt)
    }

    private fun backoffMillis(attempt: Int): Long = (1L shl attempt) * 1_000L

    private fun parseRetryAfterMillis(raw: String, nowEpochMillis: Long): Long? {
        raw.toDoubleOrNull()?.let { seconds ->
            return if (seconds < 0.0 || seconds.isNaN() || seconds.isInfinite()) null else (seconds * 1_000.0).toLong()
        }
        return parseHttpDate(raw)?.let { it.toEpochMilli() - nowEpochMillis }
    }

    private fun parseHttpDate(raw: String): Instant? =
        try {
            ZonedDateTime.parse(raw, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant()
        } catch (_: DateTimeParseException) {
            null
        }
}
