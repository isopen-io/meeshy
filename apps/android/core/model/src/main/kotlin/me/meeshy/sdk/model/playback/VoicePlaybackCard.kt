package me.meeshy.sdk.model.playback

import java.text.DateFormat
import java.time.Instant
import java.time.ZoneId
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Le vocal que la carte de lecture du système (notification, écran verrouillé, casque) décrit —
 * port de `Track` / `PlaybackRules` de la coque `apps/web/android` (#10624), miroir de la carte
 * Now Playing d'iOS (`ConversationAudioCoordinator+NowPlaying`).
 *
 * [sentAtLabel] est la date courte DÉJÀ mise en forme pour la locale : cette règle reste pure.
 * [isProtected] vaut pour un vocal éphémère, à vue unique, flouté ou chiffré — la carte ne dit alors
 * que son auteur, comme la Live Activity iOS (`VoicePlaybackActivityLaw`).
 */
public data class VoicePlaybackCard(
    val attachmentId: String,
    val sender: String? = null,
    val conversation: String? = null,
    val sentAtLabel: String? = null,
    val artworkUrl: String? = null,
    val isProtected: Boolean = false,
    val durationMs: Long = 0L,
    /** La conversation et le message du vocal : renseignés par le seul lecteur de conversation, jamais pour l'audio d'un post. */
    val conversationId: String? = null,
    val messageId: String? = null,
)

/** L'état de transport que la carte extrapole : la position, puis l'horloge fait avancer la barre. */
public data class VoicePlaybackTransportState(
    val positionMs: Long,
    val isPlaying: Boolean,
    val isBuffering: Boolean = false,
)

public data class VoicePlaybackCardLabels(
    val title: String,
    val artist: String?,
    val album: String?,
)

/** Les ordres que la carte, la notification et le casque remettent au lecteur. */
public sealed interface VoicePlaybackCommand {
    public data object Play : VoicePlaybackCommand
    public data object Pause : VoicePlaybackCommand

    /** « Arrêter » : la notification part, le vocal est lâché. */
    public data object Stop : VoicePlaybackCommand
    public data class SeekTo(val positionMs: Long) : VoicePlaybackCommand

    /** ±[VoicePlaybackCardRules.SKIP_MS] depuis la position courante. */
    public data class Skip(val offsetMs: Long) : VoicePlaybackCommand

    /** Le vocal suivant de la file (carte du moteur partagé seulement). */
    public data object Next : VoicePlaybackCommand

    /** Le vocal précédent, ou le même depuis le début ([QueueStepRule]). */
    public data object Previous : VoicePlaybackCommand
}

/** Les boutons de file que la carte propose : [previous] relance quand la file n'a pas d'historique. */
public data class VoicePlaybackQueueActions(val previous: Boolean, val next: Boolean)

public object VoicePlaybackCardRules {

    public const val SKIP_MS: Long = 15_000L

    /**
     * Titre « {conversation} — {date courte} », artiste l'auteur, album la conversation ; hors
     * conversation, l'auteur seul ; un vocal protégé ne dit que son auteur et [protectedMessage].
     */
    public fun labels(
        card: VoicePlaybackCard,
        voiceMessage: String,
        protectedMessage: String,
    ): VoicePlaybackCardLabels {
        val author = card.sender.present()
        val named = author ?: voiceMessage
        if (card.isProtected) return VoicePlaybackCardLabels(named, protectedMessage, null)
        val place = card.conversation.present() ?: return VoicePlaybackCardLabels(named, null, null)
        val sentAt = card.sentAtLabel.present() ?: return VoicePlaybackCardLabels(place, author, place)
        return VoicePlaybackCardLabels("$place — $sentAt", author, place)
    }

    /**
     * Un vocal protégé (éphémère, à vue unique, flouté, chiffré) ne livre AUCUNE métadonnée à la session du
     * système : ni auteur, ni conversation, ni date, ni avatar. Les identifiants de la conversation et du message
     * restent, car ils ne vivent que dans l'intention du toucher, jamais sur la carte.
     */
    public fun shown(card: VoicePlaybackCard): VoicePlaybackCard =
        if (card.isProtected) card.copy(sender = null, conversation = null, sentAtLabel = null, artworkUrl = null) else card

    /**
     * « Suivant » et « précédent » de la carte. Un lecteur sans file (écran du fil, audio d'un post) n'en offre
     * aucun ; une carte de file offre TOUJOURS « précédent » (iOS : sans historique il relance le vocal) et
     * « suivant » seulement s'il reste un vocal après.
     */
    public fun queueActions(controls: VoicePlaybackQueueControls?): VoicePlaybackQueueActions =
        if (controls == null) VoicePlaybackQueueActions(previous = false, next = false) else VoicePlaybackQueueActions(previous = true, next = controls.hasNext)

    /** Où la lecture en est à [nowMillis], d'après le dernier état remis à [anchorMillis]. */
    public fun projected(
        state: VoicePlaybackTransportState,
        anchorMillis: Long,
        nowMillis: Long,
        durationMs: Long,
    ): Long {
        if (!state.isPlaying || state.isBuffering) return clamp(state.positionMs, durationMs)
        return clamp(state.positionMs + (nowMillis - anchorMillis).coerceAtLeast(0L), durationMs)
    }

    public fun skip(positionMs: Long, offsetMs: Long, durationMs: Long): Long =
        clamp(positionMs + offsetMs, durationMs)

    /** Une durée inconnue (`0`) ne borne que par le bas. */
    public fun clamp(positionMs: Long, durationMs: Long): Long {
        val floor = positionMs.coerceAtLeast(0L)
        return if (durationMs > 0L) floor.coerceAtMost(durationMs) else floor
    }

    /** La date courte d'envoi (`DateFormat.SHORT` des deux côtés), ou `null` si [iso] ne se lit pas. */
    public fun sentAtLabel(iso: String?, locale: Locale, zone: ZoneId): String? {
        val instant = iso?.let { runCatching { Instant.parse(it) }.getOrNull() } ?: return null
        val format = DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT, locale)
        format.timeZone = TimeZone.getTimeZone(zone)
        return format.format(Date.from(instant))
    }

    /** La date courte d'envoi d'un vocal de la file, depuis son instant d'arrivée en millisecondes. */
    public fun sentAtLabel(epochMs: Long, locale: Locale, zone: ZoneId): String {
        val format = DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT, locale)
        format.timeZone = TimeZone.getTimeZone(zone)
        return format.format(Date(epochMs))
    }

    /** La carte ne télécharge une image que sur HTTPS, sans identifiants dans l'adresse. */
    public fun isArtworkFetchable(url: String?): Boolean {
        val value = url?.trim().orEmpty()
        if (!value.startsWith("https://", ignoreCase = true)) return false
        val authority = value.substring("https://".length).substringBefore('/').substringBefore('?')
        return authority.isNotEmpty() && '@' !in authority
    }

    private fun String?.present(): String? = this?.trim()?.takeIf { it.isNotEmpty() }
}
