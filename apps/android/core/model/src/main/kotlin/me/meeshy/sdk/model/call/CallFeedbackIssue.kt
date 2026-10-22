package me.meeshy.sdk.model.call

/** Les cases du retour de qualité d'après-appel ; [wire] est la valeur de `call:quality-feedback`. */
enum class CallFeedbackIssue(val wire: String) {
    AUDIO_QUALITY("audio_quality"),
    VIDEO_QUALITY("video_quality"),
    ECHO("echo"),
    DROPPED("dropped"),
    SYNC("sync"),
    OTHER("other"),
}

/**
 * La note d'après-appel. `null` d'une note hors 1..5 ou d'un appel sans identifiant ;
 * les cases sont dédoublonnées dans l'ordre de cochage.
 */
class CallQualityFeedback private constructor(
    val callId: String,
    val rating: Int,
    val issues: List<CallFeedbackIssue>,
) {
    /** `rating` toujours, `issues` seulement s'il y en a (une vieille passerelle strict-schema l'accepte). */
    fun socketFields(): Map<String, Any> {
        val base = mapOf<String, Any>("callId" to callId, "rating" to rating)
        return if (issues.isEmpty()) base else base + ("issues" to issues.map { it.wire })
    }

    companion object {
        val RATING_RANGE = 1..5

        fun of(callId: String, rating: Int, issues: List<CallFeedbackIssue>): CallQualityFeedback? =
            if (callId.isBlank() || rating !in RATING_RANGE) null
            else CallQualityFeedback(callId, rating, issues.distinct())
    }
}
