package me.meeshy.sdk.model.call

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Les corps et les charges des routes REST d'appel qui ne sont pas le journal
 * (`GET /calls/history`, déjà couvert par [CallRecord]) : la création, la
 * participation, la fin, l'attache d'un enregistrement et la transcription.
 *
 * Source : `services/gateway/src/routes/calls-lifecycle.ts`,
 * `calls-consultation.ts`, `calls-recording.ts` et leurs schémas Zod
 * (`validation/call-schemas.ts`, `call-recording-schemas.ts`). Les réponses qui
 * rendent une session (`callSessionSchema`) se décodent en [ActiveCallSession].
 */

/** La nature d'un appel à lancer — l'énumération `video | audio` du corps de `POST /calls`. */
@Serializable
enum class InitiateCallKind {
    @SerialName("audio") AUDIO,
    @SerialName("video") VIDEO,
}

/**
 * Les réglages média d'un appel qu'on LANCE. Un champ nul n'est pas écrit : la
 * passerelle applique alors son défaut (audio et vidéo actifs, partage d'écran
 * coupé).
 */
@Serializable
data class CallMediaSettings(
    val audioEnabled: Boolean? = null,
    val videoEnabled: Boolean? = null,
    val screenShareEnabled: Boolean? = null,
)

/** Corps de `POST /calls`. */
@Serializable
data class InitiateCallRequest(
    val conversationId: String,
    val type: InitiateCallKind,
    val settings: CallMediaSettings? = null,
)

/** Les réglages média d'un appel qu'on REJOINT — pas de partage d'écran à l'arrivée. */
@Serializable
data class JoinCallSettings(
    val audioEnabled: Boolean? = null,
    val videoEnabled: Boolean? = null,
)

/** Corps de `POST /calls/{callId}/participants`. Le corps est optionnel côté serveur : `{}` suffit. */
@Serializable
data class JoinCallRequest(
    val settings: JoinCallSettings? = null,
)

/** Corps de `POST /calls/{callId}/recordings/{recordingId}/attachment` — `.strict()` côté serveur : rien d'autre. */
@Serializable
data class CallRecordingLinkRequest(
    val attachmentId: String,
)

/** `data` du rattachement d'un enregistrement à la bulle d'appel. [kind] : `audio` | `video`. */
@Serializable
data class CallRecordingLink(
    val recordingId: String,
    val messageId: String,
    val attachmentId: String,
    val kind: String? = null,
)

/** Une traduction d'un segment de transcription. */
@Serializable
data class PersistedTranscriptTranslation(
    val targetLanguage: String,
    val translatedText: String,
)

/**
 * Un segment FINAL du journal de transcription PERSISTÉ, dans l'ordre de capture. Distinct de
 * [CallTranscriptSegment], le segment VIVANT que la superposition de sous-titres accumule pendant l'appel.
 */
@Serializable
data class PersistedTranscriptSegment(
    val id: String,
    val speakerId: String,
    val speakerDisplayName: String? = null,
    val text: String,
    val language: String,
    val confidence: Double? = null,
    val capturedAtMs: Long,
    val translations: List<PersistedTranscriptTranslation> = emptyList(),
)

/**
 * `data` de `GET /calls/{callId}/transcript` : une page du journal persisté.
 *
 * DONNÉE SENSIBLE (la passerelle ne journalise jamais ce contenu et réserve la
 * route aux participants EFFECTIFS de l'appel) : [toString] n'imprime que des
 * comptes, jamais un texte.
 */
@Serializable
data class CallTranscriptPage(
    val callId: String,
    val conversationId: String,
    val callStartedAt: String? = null,
    val total: Int = 0,
    val hasMore: Boolean = false,
    val segments: List<PersistedTranscriptSegment> = emptyList(),
) {
    override fun toString(): String =
        "CallTranscriptPage(callId=$callId, total=$total, hasMore=$hasMore, segments=${segments.size})"
}

/** `data` de `DELETE /calls/history/{callId}` — l'appel quitte le journal de CET utilisateur seulement. */
@Serializable
data class CallHistoryRemoval(
    val callId: String,
    val hidden: Boolean = false,
)

/** `data` de `DELETE /calls/history` — combien de lignes le journal a perdues. */
@Serializable
data class CallHistoryCleared(
    val cleared: Int = 0,
)
