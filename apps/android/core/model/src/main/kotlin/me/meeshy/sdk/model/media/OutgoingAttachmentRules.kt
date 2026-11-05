package me.meeshy.sdk.model.media

import me.meeshy.sdk.model.AttachmentMessageType
import me.meeshy.sdk.model.guest.GuestAttachmentKind
import me.meeshy.sdk.model.guest.GuestAttachmentRefusal

/**
 * Les règles pures de l'envoi de pièces jointes d'une conversation (iOS `OutgoingAttachmentRules`) : ce qu'elles décident ne
 * dépend que de leurs entrées. Une règle a UNE adresse ; le site d'envoi et les témoins l'appellent ici.
 */
public object OutgoingAttachmentRules {

    /** Le consentement vocal se demande à l'envoi d'un audio, s'il manque et si la session ne l'a pas déjà proposé. */
    public fun shouldPromptVoiceConsent(hasAudio: Boolean, consentMissing: Boolean, alreadyPrompted: Boolean): Boolean =
        hasAudio && consentMissing && !alreadyPrompted

    /**
     * Le type de la bulle OPTIMISTE d'un groupe, lu sur TOUTES ses pièces — miroir de `messageTypeForClientAttachments`
     * (`packages/shared/utils/attachment-message-type.ts`) : une seule catégorie présente => cette catégorie, plusieurs
     * mélangées => `file`. Le groupe visuel mêle images, vidéos ET documents : le cas hétérogène est le cas NOMINAL, et ce que
     * le client déclare, le serveur ne le corrige pas.
     */
    public fun optimisticMessageType(isAudioGroup: Boolean, mimeTypes: List<String?>): String {
        if (isAudioGroup) return AttachmentMessageType.AUDIO
        val buckets = mimeTypes.map(AttachmentMessageType::forMime)
        val first = buckets.firstOrNull() ?: return AttachmentMessageType.FILE
        return if (buckets.all { it == first }) first else AttachmentMessageType.FILE
    }

    /** Le type MIME d'un groupe audio part TOUJOURS en `audio/mp4`; les autres gardent le leur (vide = `application/octet-stream`). */
    public fun uploadMimeType(isAudioGroup: Boolean, mimeType: String?): String =
        if (isAudioGroup) AUDIO_UPLOAD_MIME else mimeType?.takeIf { it.isNotBlank() } ?: GENERIC_MIME

    /**
     * Le motif d'un échec d'envoi, complété d'un conseil quand plusieurs pièces sont en jeu : en réduire le nombre. Silencieux
     * sur une pièce isolée — « réduire » n'y veut rien dire. [reduceHint] reçoit le nombre de pièces et rend la phrase localisée.
     */
    public fun uploadFailureReason(errorMessage: String?, attachmentCount: Int, reduceHint: (Int) -> String): String {
        val base = errorMessage?.takeIf { it.isNotBlank() } ?: UNKNOWN_FAILURE
        return if (attachmentCount > 1) "$base ${reduceHint(attachmentCount)}" else base
    }

    /**
     * Le refus d'une pièce d'INVITÉ, gravé sur la bulle : DÉFINITIF (le rejouer ne le fera pas passer) et lisible par l'écran,
     * qui dit pourquoi — famille fermée (avec les types autorisés) ou pièce trop lourde.
     */
    public fun guestRefusalReason(refusal: GuestAttachmentRefusal, allowedKinds: List<GuestAttachmentKind>?): String =
        listOf(GUEST_REFUSAL_PREFIX, refusal.reason.code, allowedKinds?.joinToString(",") { it.wire }.orEmpty()).joinToString(SEPARATOR)

    /** Lit un motif gravé par [guestRefusalReason] ; `null` si [reason] n'en est pas un. */
    public fun parseGuestRefusal(reason: String?): GuestRefusalReading? {
        val parts = reason?.takeIf { it.startsWith(GUEST_REFUSAL_PREFIX + SEPARATOR) }?.split(SEPARATOR) ?: return null
        val code = GuestAttachmentRefusal.Reason.entries.firstOrNull { it.code == parts.getOrNull(1) } ?: return null
        val kinds = parts.getOrNull(2)?.takeIf { it.isNotEmpty() }?.let { GuestAttachmentKind.knownKinds(it.split(",")) }
        return GuestRefusalReading(code, kinds)
    }

    /** Un motif d'échec qui ne se rejoue pas : la bulle propose de le retirer, jamais de le renvoyer. */
    public fun isDefinitiveReason(reason: String?): Boolean = parseGuestRefusal(reason) != null

    public data class GuestRefusalReading(val reason: GuestAttachmentRefusal.Reason, val allowedKinds: List<GuestAttachmentKind>?)

    public const val AUDIO_UPLOAD_MIME: String = "audio/mp4"
    private const val GENERIC_MIME = "application/octet-stream"
    private const val UNKNOWN_FAILURE = "Upload failed"
    private const val GUEST_REFUSAL_PREFIX = "guest-attachment-refused"
    private const val SEPARATOR = "|"
}
