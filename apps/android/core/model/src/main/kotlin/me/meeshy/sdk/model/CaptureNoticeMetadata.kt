package me.meeshy.sdk.model

import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * **L'avis de capture** (#9617) — « Alice a capturé l'éphémère du 07/10/2026 à 14:05 »,
 * « Alice a tenté de capturer un message à vue unique — impossible ».
 *
 * Le sens voyage dans `Message.metadata` (`kind == "content-capture"`), jamais dans le
 * texte : la phrase se compose CHEZ LE LECTEUR ([SystemNoticeText.capture]), dans sa langue
 * et son fuseau. L'avis ne porte AUCUN contenu du message capturé : son identifiant, sa
 * nature, son heure d'ENVOI.
 *
 * Miroir de `CaptureNoticeMetadata` (iOS) et de `parseCaptureNotice`
 * (`packages/shared/utils/capture-notice.ts`, qui fait foi).
 */
data class CaptureNoticeMetadata(
    val actor: Actor,
    val capturedMessageId: String,
    /** Jamais [ContentExitLaw.Nature.ORDINARY] : la capture d'un message ordinaire n'a pas d'avis. */
    val nature: ContentExitLaw.Nature,
    val captureKind: CaptureKind,
    /** Heure d'ENVOI du message capturé, en millisecondes epoch. */
    val sentAtEpochMillis: Long,
) {
    /** `blocked` : vue unique, l'image était noire — une TENTATIVE. `announced` : la capture a eu lieu. */
    enum class Outcome { ANNOUNCED, BLOCKED }

    enum class CaptureKind { SCREENSHOT, RECORDING }

    /**
     * Celui qui a capturé. [isAnonymous] est OBLIGATOIRE sur le fil : un nom affiché n'est
     * pas une identité, un invité peut s'appeler « Bob ». Le pseudo n'est jamais retenu
     * pour un invité.
     */
    data class Actor(
        val participantId: String,
        val displayName: String,
        val isAnonymous: Boolean,
        val username: String? = null,
    )

    /** L'issue se DÉRIVE de la nature — jamais de l'appelant. */
    val outcome: Outcome get() = outcomeOf(nature)

    companion object {
        const val KIND = "content-capture"

        fun outcomeOf(nature: ContentExitLaw.Nature): Outcome =
            if (nature == ContentExitLaw.Nature.VIEW_ONCE) Outcome.BLOCKED else Outcome.ANNOUNCED

        /**
         * VALIDE plutôt que caste : une issue qui contredit la nature (vue unique
         * « annoncée », flamme « bloquée ») est une forme fausse, pas un avis.
         */
        fun parse(metadata: JsonObject?): CaptureNoticeMetadata? {
            if (metadata.text("kind") != KIND) return null
            val rawActor = metadata?.get("actor") as? JsonObject ?: return null
            val participantId = rawActor.text("participantId")?.takeIf { it.isNotEmpty() } ?: return null
            val displayName = rawActor.text("displayName")?.takeIf { it.isNotEmpty() } ?: return null
            val isAnonymous = rawActor.flag("isAnonymous") ?: return null
            val rawUsername = rawActor["username"]
            val usernameIsText = rawUsername == null || rawUsername is JsonNull ||
                (rawUsername is JsonPrimitive && rawUsername.isString)
            if (!usernameIsText) return null
            val capturedMessageId = metadata.text("capturedMessageId")?.takeIf { it.isNotEmpty() } ?: return null
            val nature = when (metadata.text("nature")) {
                "timed-flame" -> ContentExitLaw.Nature.TIMED_FLAME
                "after-read-flame" -> ContentExitLaw.Nature.AFTER_READ_FLAME
                "view-once" -> ContentExitLaw.Nature.VIEW_ONCE
                else -> return null
            }
            val expected = if (outcomeOf(nature) == Outcome.BLOCKED) "blocked" else "announced"
            if (metadata.text("outcome") != expected) return null
            val captureKind = when (metadata.text("captureKind")) {
                "screenshot" -> CaptureKind.SCREENSHOT
                "recording" -> CaptureKind.RECORDING
                else -> return null
            }
            val sentAt = isoToEpochMillisOrNull(metadata.text("sentAt")) ?: return null
            return CaptureNoticeMetadata(
                actor = Actor(
                    participantId = participantId,
                    displayName = displayName,
                    isAnonymous = isAnonymous,
                    username = rawActor.text("username")?.takeIf { it.isNotEmpty() && !isAnonymous },
                ),
                capturedMessageId = capturedMessageId,
                nature = nature,
                captureKind = captureKind,
                sentAtEpochMillis = sentAt,
            )
        }
    }
}
