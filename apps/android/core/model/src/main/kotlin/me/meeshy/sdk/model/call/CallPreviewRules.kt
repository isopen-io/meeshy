package me.meeshy.sdk.model.call

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Où en est l'appel 1:1, vu de l'aperçu avant décroché (#8480) — miroir d'iOS
 * `CallManager.previewPhase(of:)`. Sur Android l'appel entrant sonne toujours dans l'app
 * (écran plein, y compris par l'intention plein écran) : la sonnerie entrante est donc
 * toujours [IncomingRinging].
 */
enum class CallPreviewPhase {
    None,

    /** L'appel entrant sonne : l'appelé demande l'aperçu. */
    IncomingRinging,

    /** L'appel sortant attend le décroché (sonnerie puis offre) : l'appelant répond aux demandes. */
    OutgoingRinging,

    /** Décroché, le vrai lien s'établit : l'aperçu TIENT jusqu'à sa connexion (#8627). */
    Answering,

    Connected,
    Ended;

    companion object {
        fun of(state: CallState): CallPreviewPhase = when (state) {
            CallState.Idle -> None
            is CallState.Ringing -> if (state.isOutgoing) OutgoingRinging else IncomingRinging
            CallState.Offering -> OutgoingRinging
            CallState.Connecting -> Answering
            CallState.Connected, is CallState.Reconnecting -> Connected
            is CallState.Ended -> Ended
        }
    }
}

/**
 * Ce que l'appelant laisse voir et entendre AVANT le décroché (#8795), pour UN correspondant —
 * miroir d'iOS `CallPreviewConsent`. Il ne gouverne que l'aperçu : au décroché, l'appel démarre
 * avec ses médias normaux.
 */
@Serializable
data class CallPreviewConsent(val sendsAudio: Boolean, val sendsVideo: Boolean) {

    /** Le micro de l'aperçu : ouvert pour CE correspondant, et pas coupé pour l'appel. */
    fun sendsAudio(micMuted: Boolean): Boolean = sendsAudio && !micMuted

    /** La caméra de l'aperçu : activée pour CE correspondant, sur un appel vidéo caméra allumée. */
    fun sendsVideo(videoEnabled: Boolean): Boolean = sendsVideo && videoEnabled

    companion object {
        /** Un contact jamais appelé : micro coupé, caméra activée (directive porteur 2026-09-30). */
        val INITIAL = CallPreviewConsent(sendsAudio = false, sendsVideo = true)
    }
}

/**
 * Ce que l'appelé reçoit VRAIMENT de l'appelant avant de décrocher (#8795) : le libellé de
 * l'appelant n'en dit jamais plus. « Vu » dès que la caméra de l'aperçu l'atteint ; « entendu »
 * seulement quand l'appelé a lui-même activé le son ET que le micro de l'aperçu part.
 */
enum class CallPreviewExposure {
    Nothing,
    Seen,
    Heard,
    SeenAndHeard;

    companion object {
        fun of(
            reachesCallee: Boolean,
            heardByCallee: Boolean,
            consent: CallPreviewConsent,
            micMuted: Boolean,
            videoEnabled: Boolean,
        ): CallPreviewExposure {
            val sees = reachesCallee && consent.sendsVideo(videoEnabled)
            val hears = reachesCallee && heardByCallee && consent.sendsAudio(micMuted)
            return when {
                sees && hears -> SeenAndHeard
                sees -> Seen
                hears -> Heard
                else -> Nothing
            }
        }
    }
}

/**
 * Le canal de contrôle du lien d'aperçu (#8795) : l'appelé dit à l'appelant s'il a activé le son.
 * Même libellé et même forme qu'iOS (`WebRTCGroupPeerLink.controlChannelLabel`) et le web (#8796).
 */
object CallPreviewControl {
    const val CHANNEL_LABEL: String = "meeshy-preview-control"

    @Serializable
    private data class Message(val audible: Boolean? = null)

    private val json = Json { ignoreUnknownKeys = true }

    fun encode(audible: Boolean): ByteArray = """{"audible":$audible}""".toByteArray(Charsets.UTF_8)

    /** `null` pour une trame illisible ou sans `audible` : elle est ignorée. */
    fun decode(bytes: ByteArray): Boolean? =
        runCatching { json.decodeFromString<Message>(String(bytes, Charsets.UTF_8)).audible }.getOrNull()
}

/**
 * Les serveurs ICE du lien d'aperçu. L'appelé qui sonne n'en reçoit aucun (il n'est pas encore
 * participant : `call:request-ice-servers` lui répondrait `call:error`, qui couperait l'appel) :
 * il part sur les STUN publics d'iOS (`IceServer.defaultServers`), l'appelant offrant ses relais TURN.
 */
object CallPreviewIce {
    val DEFAULT_SERVERS: List<SocketIceServer> = listOf(
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        "stun:stun2.l.google.com:19302",
        "stun:stun6.l.google.com:19302",
        "stun:stun.cloudflare.com:3478",
    ).map { SocketIceServer(urls = listOf(it)) }

    fun orDefault(known: List<SocketIceServer>): List<SocketIceServer> = known.ifEmpty { DEFAULT_SERVERS }
}
