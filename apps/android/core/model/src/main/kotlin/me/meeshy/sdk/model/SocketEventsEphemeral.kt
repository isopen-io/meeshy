package me.meeshy.sdk.model

import java.util.UUID

/**
 * La capture d'un contenu qui disparaît (#9617), vue du socket : le client DÉTECTE une capture et DÉCLARE
 * les messages visibles à cet instant ; la passerelle juge chacun et écrit l'avis. Miroir de
 * `ContentCapture.swift` et de `MessageSocketManager+ContentCapture.swift` (iOS) ; valeurs et règles pures.
 */
object EphemeralSocketEventNames {
    /** Client vers serveur, avec accusé `{ success, data: { noticedMessageIds } }`. */
    const val MESSAGE_CAPTURE_DETECTED = "message:capture-detected"
}

/** `screenshot` : une capture ; `recording` : un enregistrement ou une recopie d'écran. */
enum class ContentCaptureKind(val wire: String) {
    SCREENSHOT("screenshot"),
    RECORDING("recording"),
}

/**
 * Un refus d'ensemble de la passerelle, une échéance (`TIMEOUT`) ou une absence de socket (`NO_SOCKET`).
 * [isFinal] : un refus qui ne changera pas en réessayant par l'autre transport. Seuls `NO_SOCKET` et
 * `TIMEOUT` (et tout code inconnu) basculent sur le REST.
 */
data class ContentCaptureRefusal(val code: String) : Exception(code) {

    val isFinal: Boolean get() = code in FINAL_CODES || code.startsWith("HTTP_4")

    /** Le repli REST n'a de sens que pour une socket absente ou muette. */
    val fallsBackToRest: Boolean get() = !isFinal

    companion object {
        const val NO_SOCKET = "NO_SOCKET"
        const val TIMEOUT = "TIMEOUT"
        const val MALFORMED_ACK = "MALFORMED_ACK"
        const val RATE_LIMITED = "RATE_LIMITED"
        const val NOT_A_PARTICIPANT = "NOT_A_PARTICIPANT"

        val FINAL_CODES: Set<String> = setOf(
            "UNAUTHENTICATED", "VALIDATION_ERROR", NOT_A_PARTICIPANT, RATE_LIMITED, "CONVERSATION_CLOSED",
        )
    }
}

/** Un message RÉELLEMENT à l'écran au moment d'une capture. */
data class ContentCaptureCandidate(
    val conversationId: String,
    val messageId: String,
    val capture: ContentExitLaw.CaptureVerdict,
    /** Le lecteur est l'auteur : sa propre capture ne s'annonce pas. */
    val isMine: Boolean,
) {
    /** Ni ordinaire, ni à soi, ni encore en vol (la passerelle refuse le lot ENTIER au premier id qui n'est pas un ObjectId). */
    val isDeclared: Boolean
        get() = capture.isDeclared && !isMine && conversationId.isNotEmpty() && ContentCaptureReport.isDeclarableMessageId(messageId)
}

/** La charge de `message:capture-detected` et de `POST /conversations/:id/messages/capture`. */
data class ContentCaptureReport(
    val conversationId: String,
    val messageIds: List<String>,
    val kind: ContentCaptureKind,
    val captureId: String,
) {
    /** Les champs de l'événement socket (la passerelle lit `conversationId` dans la charge). */
    fun socketFields(): Map<String, Any> = mapOf(
        "conversationId" to conversationId,
        "messageIds" to messageIds,
        "kind" to kind.wire,
        "captureId" to captureId,
    )

    fun body(): ContentCaptureRequest = ContentCaptureRequest(messageIds, kind.wire, captureId)

    companion object {
        /** La passerelle accepte 50 identifiants mais n'annonce que 10 avis par déclaration. */
        const val MAX_MESSAGES = 10

        private val OBJECT_ID = Regex("^[0-9a-fA-F]{24}$")
        private val CAPTURE_ID = Regex("^[A-Za-z0-9_-]{8,64}$")

        fun isDeclarableMessageId(value: String): Boolean = OBJECT_ID.matches(value)

        fun isValidCaptureId(value: String): Boolean = CAPTURE_ID.matches(value)

        /** Un identifiant NEUF par capture d'écran. */
        fun newCaptureId(): String = "cap_" + UUID.randomUUID().toString().replace("-", "").lowercase()

        /** Les déclarations d'UNE capture : déclarables seulement, dédoublonnées, un lot par conversation, [MAX_MESSAGES] au plus. */
        fun reports(
            candidates: List<ContentCaptureCandidate>,
            kind: ContentCaptureKind,
            captureId: String,
        ): List<ContentCaptureReport> =
            candidates.filter { it.isDeclared }
                .distinctBy { it.conversationId to it.messageId }
                .groupBy { it.conversationId }
                .flatMap { (conversationId, group) ->
                    group.map { it.messageId }.chunked(MAX_MESSAGES)
                        .map { ContentCaptureReport(conversationId, it, kind, captureId) }
                }
    }
}
