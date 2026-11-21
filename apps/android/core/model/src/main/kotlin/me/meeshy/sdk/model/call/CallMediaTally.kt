package me.meeshy.sdk.model.call

/**
 * **Ce que l'appel retient de ses lectures média** (#19895) — le miroir de
 * `withMedia` / `mediaFields` (web, `call-analytics.ts`, #19876) et de
 * `CallAnalyticsRecorder.recordMedia` (iOS) : le DERNIER relevé (les compteurs
 * sont cumulés par WebRTC), la somme des gigues pour le MOS, et le décompte des
 * causes de limitation. Mémoire bornée : jamais l'historique des échantillons.
 */
data class CallMediaTally(
    val last: CallMediaQuality? = null,
    val samples: Int = 0,
    val jitterSumMs: Double = 0.0,
    val limitations: Map<String, Int> = emptyMap(),
) {
    /** Une lecture : elle remplace la précédente, sa gigue s'ajoute, sa cause connue se compte. */
    fun plus(media: CallMediaQuality, jitterMs: Double): CallMediaTally {
        val reason = media.qualityLimitationReason?.takeIf { it in LIMITATION_REASONS }
        return copy(
            last = media,
            samples = samples + 1,
            jitterSumMs = jitterSumMs + (if (jitterMs.isFinite()) maxOf(jitterMs, 0.0) else 0.0),
            limitations = reason?.let { limitations + (it to ((limitations[it] ?: 0) + 1)) } ?: limitations,
        )
    }

    /**
     * Les champs de qualité de `call:analytics` (#11277), chacun SEULEMENT s'il a été
     * mesuré et fini : un client n'invente aucune valeur, et une valeur hors des bornes de
     * `socketCallAnalyticsSchema` ferait perdre toute la télémétrie de l'appel.
     */
    fun fields(averageRttMs: Double, averagePacketLossPercent: Double): Map<String, Any> {
        val media = last ?: return emptyMap()
        if (samples == 0) return emptyMap()
        val emitted = media.jitterBufferEmittedCount ?: 0.0
        val mos = CallMos.estimate(averageRttMs, jitterSumMs / samples, averagePacketLossPercent)
        val measured: Map<String, Any?> = linkedMapOf(
            "freezeCount" to count(media.freezeCount),
            "totalFreezesDuration" to finite(media.totalFreezesDuration),
            "qualityLimitationReason" to dominantLimitation(),
            "jitterBufferDelay" to media.jitterBufferDelay?.takeIf { emitted > 0.0 }?.let { finite(it * 1000 / emitted) },
            "concealedSamples" to count(media.concealedSamples),
            "nackCount" to count(media.nackCount),
            "pliCount" to count(media.pliCount),
            "mos" to Math.round(mos * 100) / 100.0,
            "candidateType" to media.candidateType?.take(WIRE_TEXT_MAX),
            "relayProtocol" to media.relayProtocol?.take(WIRE_TEXT_MAX),
        )
        return measured.mapNotNull { (key, value) -> value?.let { key to it } }.toMap()
    }

    /** La cause la plus fréquente ; à égalité, la première dans l'ordre alphabétique, comme iOS et le web. */
    private fun dominantLimitation(): String? =
        LIMITATION_REASONS.fold(null as String?) { best, reason ->
            val count = limitations[reason] ?: 0
            if (count > (best?.let { limitations[it] } ?: 0)) reason else best
        }

    private companion object {
        /** Ordre alphabétique : il tranche les égalités. */
        val LIMITATION_REASONS = listOf("bandwidth", "cpu", "none", "other")

        /** `candidateType` et `relayProtocol` sont bornés à 20 caractères par la passerelle. */
        const val WIRE_TEXT_MAX = 20

        fun finite(value: Double?): Double? = value?.takeIf { it.isFinite() && it >= 0.0 }

        /** `z.number().int()` (zod 4) refuse un entier au-delà de 2^53 − 1 : un compte hors de cette plage ne part pas. */
        const val MAX_SAFE_INTEGER: Double = 9_007_199_254_740_991.0

        fun count(value: Double?): Long? = finite(value)?.takeIf { it <= MAX_SAFE_INTEGER }?.let { Math.round(it) }
    }
}
