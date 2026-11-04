package me.meeshy.sdk.model.playback

import java.time.ZoneId
import java.util.Locale
import kotlin.math.abs
import me.meeshy.sdk.model.QueuedAudio

/** Ce que la file offre à la carte : « suivant » n'existe que s'il y a un vocal après, « précédent » relance sinon. */
public data class VoicePlaybackQueueControls(val hasNext: Boolean, val hasPrevious: Boolean)

/** La carte du moteur partagé, prête à être publiée. */
public data class SharedVoiceCard(
    val card: VoicePlaybackCard,
    val transport: VoicePlaybackTransportState,
    val controls: VoicePlaybackQueueControls,
)

/**
 * **La carte système du moteur partagé** — miroir de iOS `ConversationAudioCoordinator+NowPlaying` : le
 * vocal courant de la file, la conversation jouée et l'état du moteur deviennent une carte (auteur,
 * « conversation — date », avatar de l'auteur sinon de la conversation) et ses commandes de file.
 *
 * Pendant un appel, la carte n'existe pas (iOS efface `nowPlayingInfo` et désarme les commandes) : la
 * projection rend `null`, et le service se rend.
 */
public object SharedVoiceCardProjection {

    /** Un écart de position au-delà duquel l'horloge de la carte n'a plus raison : un déplacement dans le vocal. */
    public const val SEEK_TOLERANCE_MS: Long = 1_500L

    /**
     * La projection tourne à chaque tic du moteur (dix par seconde) : [sentAtLabel] laisse l'appelant mémoriser la
     * date formatée d'un vocal, la seule étape coûteuse ; par défaut, elle se compose à chaque appel.
     */
    @Suppress("LongParameterList")
    public fun of(
        audio: QueuedAudio?,
        conversationName: String,
        conversationArtworkUrl: String?,
        playback: AudioPlaybackState,
        hasNext: Boolean,
        hasPrevious: Boolean,
        callActive: Boolean,
        locale: Locale,
        zone: ZoneId,
        sentAtLabel: (epochMs: Long) -> String = { VoicePlaybackCardRules.sentAtLabel(it, locale, zone) },
    ): SharedVoiceCard? {
        if (audio == null || callActive) return null
        val loaded = playback.attachmentId == audio.attachmentId
        val card = VoicePlaybackCard(
            attachmentId = audio.attachmentId,
            sender = audio.senderName,
            conversation = conversationName,
            sentAtLabel = sentAtLabel(audio.receivedAtEpochMs),
            artworkUrl = NowPlayingArtworkPlan.preferredAvatarUrl(audio.senderAvatarUrl, conversationArtworkUrl),
            isProtected = audio.isProtected,
            durationMs = playback.durationMs.takeIf { loaded && it > 0L } ?: audio.durationMs,
            conversationId = audio.conversationId,
            messageId = audio.messageId,
        )
        val transport = if (loaded) {
            VoicePlaybackTransportState(playback.currentTimeMs, playback.isPlaying, isBuffering = playback.isLoading)
        } else {
            VoicePlaybackTransportState(positionMs = 0L, isPlaying = false, isBuffering = true)
        }
        return SharedVoiceCard(card, transport, VoicePlaybackQueueControls(hasNext, hasPrevious))
    }

    /**
     * La carte avance seule par extrapolation : on ne republie qu'aux RUPTURES — autre vocal, autres
     * commandes, lecture, pause, attente du réseau, ou position qui s'écarte de l'extrapolation de la
     * dernière publication ([publishedAtMs]) de plus de [SEEK_TOLERANCE_MS].
     */
    public fun needsRepublish(last: SharedVoiceCard, publishedAtMs: Long, next: SharedVoiceCard, nowMs: Long): Boolean {
        if (last.card != next.card || last.controls != next.controls) return true
        if (last.transport.isPlaying != next.transport.isPlaying || last.transport.isBuffering != next.transport.isBuffering) return true
        val expected = VoicePlaybackCardRules.projected(last.transport, publishedAtMs, nowMs, last.card.durationMs)
        return abs(expected - next.transport.positionMs) > SEEK_TOLERANCE_MS
    }
}
