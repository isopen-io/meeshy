package me.meeshy.sdk.model.fullscreen

import me.meeshy.sdk.model.MessageTranscriptionFiche.Request
import me.meeshy.sdk.model.MessageTranscriptionSegment
import me.meeshy.sdk.model.speech.OnDeviceTranscription

/**
 * **Ce que le plein écran audio montre de la transcription** (iOS `AudioFullscreenPage+Transcription`) : le texte SERVI —
 * la transcription du serveur d'abord, sinon celle faite sur l'appareil —, l'état de la page (vide, en cours, résultat) et
 * la vibration qui accompagne une issue. Une loi pure : l'écran n'en est qu'une projection.
 */
public object AudioFullscreenTranscriptLaw {

    public enum class Origin { SERVER, LOCAL }

    /** Le texte servi et d'où il vient. */
    public data class Served(val segments: List<MessageTranscriptionSegment>, val origin: Origin)

    /** Une transcription faite sur l'appareil, déjà ramenée aux segments (secondes) que le karaoké lit. */
    public data class Local(val text: String, val segments: List<MessageTranscriptionSegment>)

    public enum class Kind { EMPTY, IN_FLIGHT, RESULT }

    public enum class Haptic { SUCCESS, ERROR }

    /**
     * La transcription à montrer : celle du serveur dès qu'elle a un texte ou des segments, sinon la locale. Un texte sans
     * segment devient UN segment de zéro à la durée (iOS `displaySegments`) : le karaoké a toujours quelque chose à allumer.
     * `null` : rien à montrer.
     */
    public fun served(
        serverSegments: List<MessageTranscriptionSegment>,
        serverText: String?,
        localSegments: List<MessageTranscriptionSegment>,
        localText: String?,
        durationMs: Long,
    ): Served? =
        segmentsOf(serverSegments, serverText, durationMs)?.let { Served(it, Origin.SERVER) }
            ?: segmentsOf(localSegments, localText, durationMs)?.let { Served(it, Origin.LOCAL) }

    private fun segmentsOf(segments: List<MessageTranscriptionSegment>, text: String?, durationMs: Long): List<MessageTranscriptionSegment>? {
        val spoken = segments.filter { it.text.isNotBlank() }
        if (spoken.isNotEmpty()) return segments
        val clean = text?.trim()?.ifEmpty { null } ?: return null
        val end = durationMs.takeIf { it > 0L }?.let { it / MILLIS_PER_SECOND }
        return listOf(MessageTranscriptionSegment(text = clean, startTime = 0.0, endTime = end))
    }

    /** L'état de la page : le résultat prime, puis la demande en cours ; au repos comme après un échec la page est vide (on peut réessayer). */
    public fun state(hasServed: Boolean, request: Request): Kind = when {
        hasServed -> Kind.RESULT
        request == Request.IN_FLIGHT -> Kind.IN_FLIGHT
        else -> Kind.EMPTY
    }

    /** La demande vue de la page : la reconnaissance sur l'appareil et la demande au serveur ne font qu'une ; en cours l'emporte sur un échec ancien. */
    public fun request(server: Request, localRunning: Boolean, localFailed: Boolean): Request = when {
        localRunning || server == Request.IN_FLIGHT -> Request.IN_FLIGHT
        localFailed || server == Request.FAILED -> Request.FAILED
        else -> Request.IDLE
    }

    /** La vibration d'une transition : la transcription qui arrive porte un succès, la demande qui échoue une erreur ; le reste se tait. */
    public fun outcome(before: Kind, after: Kind, request: Request): Haptic? = when {
        before != Kind.IN_FLIGHT -> null
        after == Kind.RESULT -> Haptic.SUCCESS
        after == Kind.EMPTY && request == Request.FAILED -> Haptic.ERROR
        else -> null
    }

    /** La reconnaissance sur l'appareil, en secondes : ce que le karaoké et la loi de [served] lisent. */
    public fun localOf(heard: OnDeviceTranscription): Local = Local(
        text = heard.text,
        segments = heard.segments.map {
            MessageTranscriptionSegment(text = it.text, startTime = it.startMs / MILLIS_PER_SECOND, endTime = it.endMs / MILLIS_PER_SECOND)
        },
    )

    private const val MILLIS_PER_SECOND = 1000.0
}
