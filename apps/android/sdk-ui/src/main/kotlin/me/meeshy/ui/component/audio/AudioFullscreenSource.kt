package me.meeshy.ui.component.audio

import androidx.compose.runtime.Immutable
import java.time.Instant
import me.meeshy.sdk.model.FeedMedia
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.MeeshyMediaConsumption
import me.meeshy.sdk.model.MessageExitOffer
import me.meeshy.sdk.model.MessageTranscriptionSegment
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.QueuedAudio
import me.meeshy.sdk.model.ServedProfileDecorItem
import me.meeshy.sdk.model.playback.MediaConsumptionSeed
import me.meeshy.sdk.model.profile.ProfileSheetUser
import me.meeshy.ui.component.bubble.BubbleAudio
import me.meeshy.ui.component.bubble.BubbleContent

/**
 * **Une page du plein écran audio, agnostique du porteur** (iOS `AudioFullscreenSource`) : un vocal de conversation, d'un
 * post, d'un commentaire ou d'un réel. L'écran ne connaît jamais le `Message` ni le `Post` : il lit ce que l'adaptateur a
 * relevé — la piste déjà élue par le Prisme ([url], [trackLanguage]), l'auteur, sa date, la consommation servie.
 *
 * Une pièce protégée (vue unique, flou, éphémère, chiffré — message OU pièce) n'a pas d'adaptateur : elle ne devient
 * jamais une page, ni d'entrée ni voisine.
 */
@Immutable
public data class AudioFullscreenSource(
    val attachmentId: String,
    val url: String,
    val durationMs: Long,
    val author: ProfileSheetUser,
    val createdAtEpochMs: Long,
    /** Le porteur : message, post, commentaire ou réel. */
    val carrierId: String,
    /** La conversation du vocal ; vide hors conversation (un post n'a pas de file de conversation). */
    val conversationId: String,
    /** Le nom que la carte système et le mini-lecteur montrent. */
    val contextName: String,
    val transcriptionText: String? = null,
    val transcriptionSegments: List<MessageTranscriptionSegment> = emptyList(),
    val trackLanguage: String? = null,
    val isTranslatedTrack: Boolean = false,
    /** La langue de la voix d'origine (la pastille « Original ») ; inconnue ⇒ `null`. */
    val originalLanguage: String? = null,
    /** Les langues des pistes traduites déjà prêtes, dans l'ordre servi : les pastilles du bandeau, jamais dédoublonnées ici ([me.meeshy.sdk.model.playback.AudioLanguageStripLaw.pills] s'en charge). */
    val translatedLanguages: List<String> = emptyList(),
    val authorRing: ServedProfileDecorItem? = null,
    /** La présence SERVIE de l'auteur ; absente ⇒ aucun point (le client ne la fabrique pas). */
    val authorPresence: PresenceState? = null,
    val servedConsumption: MeeshyMediaConsumption? = null,
    /** Ce que le porteur laisse sortir ; inconnu ⇒ `null`, et rien ne s'enregistre ([me.meeshy.sdk.model.fullscreen.AudioFullscreenDownloadOffer]). */
    val exitOffer: MessageExitOffer? = null,
) {
    val id: String get() = attachmentId

    val authorName: String get() = author.displayName?.takeIf { it.isNotBlank() } ?: author.username

    /** L'entrée de file que le lecteur partagé joue pour cette page : la piste servie, sa consommation, jamais protégée. */
    public fun queuedAudio(): QueuedAudio = QueuedAudio(
        attachmentId = attachmentId,
        messageId = carrierId,
        conversationId = conversationId,
        fileUrl = url,
        durationMs = durationMs,
        senderName = authorName,
        senderAvatarUrl = author.avatarUrl,
        receivedAtEpochMs = createdAtEpochMs,
        trackLanguage = trackLanguage,
        isTranslatedTrack = isTranslatedTrack,
        isProtected = false,
        servedConsumption = servedConsumption,
    )

    public companion object {

        /**
         * Le vocal [audio] de la bulle [bubble]. `null` pour un message supprimé, une pièce sans adresse, ou un contenu
         * protégé — le message OU la pièce ([BubbleAudio.isProtected] le porte déjà pour la pièce).
         */
        public fun fromBubble(
            bubble: BubbleContent,
            audio: BubbleAudio,
            conversationId: String,
            contextName: String,
        ): AudioFullscreenSource? {
            val url = audio.url?.takeIf { it.isNotBlank() } ?: return null
            if (bubble.isDeleted || audio.isProtected || bubble.isProtectedMessage()) return null
            val name = bubble.senderName.orEmpty()
            val author = bubble.senderProfile ?: ProfileSheetUser(
                userId = bubble.senderId,
                username = bubble.senderUsername ?: name,
                displayName = name.ifBlank { null },
                avatarUrl = bubble.senderAvatarUrl,
                accentColor = bubble.senderColorHex.orEmpty(),
            )
            return AudioFullscreenSource(
                attachmentId = audio.attachmentId,
                url = url,
                durationMs = audio.declaredDurationMs,
                author = author,
                createdAtEpochMs = epochMs(bubble.createdAtIso),
                carrierId = bubble.messageId,
                conversationId = conversationId,
                contextName = contextName,
                transcriptionText = audio.transcriptionText,
                transcriptionSegments = audio.transcriptionSegments,
                trackLanguage = audio.playedLanguage,
                isTranslatedTrack = audio.isAudioTranslated,
                originalLanguage = audio.originalLanguage,
                translatedLanguages = audio.translatedLanguages,
                authorRing = bubble.senderRing,
                servedConsumption = MediaConsumptionSeed.of(audio.lastPlayPositionMs, audio.listenedComplete),
                exitOffer = bubble.exitOffer,
            )
        }

        /**
         * Le vocal [media] d'un post, d'un commentaire ou d'un réel ([carrierId]). `null` pour un média qui n'est pas un
         * son, ou sans adresse. Hors conversation : aucune file de conversation ne lui succède.
         */
        public fun fromFeed(
            media: FeedMedia,
            author: ProfileSheetUser,
            createdAtIso: String?,
            carrierId: String,
            contextName: String,
        ): AudioFullscreenSource? {
            if (media.type != FeedMediaType.AUDIO) return null
            val url = media.url?.takeIf { it.isNotBlank() } ?: return null
            val transcription = media.transcription?.takeIf { it.text.isNotBlank() }
            return AudioFullscreenSource(
                attachmentId = media.id,
                url = url,
                durationMs = (media.duration ?: 0).coerceAtLeast(0) * MS_PER_SECOND,
                author = author,
                createdAtEpochMs = epochMs(createdAtIso),
                carrierId = carrierId,
                conversationId = "",
                contextName = contextName,
                transcriptionText = transcription?.text,
                transcriptionSegments = transcription?.segments.orEmpty(),
                trackLanguage = transcription?.language?.ifBlank { null },
            )
        }

        private fun BubbleContent.isProtectedMessage(): Boolean =
            isViewOnce || isBlurred || isEndToEndSealed || expiresAtIso != null

        private fun epochMs(iso: String?): Long =
            iso?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() } ?: 0L

        private const val MS_PER_SECOND = 1000L
    }
}
