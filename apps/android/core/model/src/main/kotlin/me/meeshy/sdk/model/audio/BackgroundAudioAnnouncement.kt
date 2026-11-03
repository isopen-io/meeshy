package me.meeshy.sdk.model.audio

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale
import me.meeshy.sdk.model.StoryEffects

/**
 * L'annonce du son d'arrière-plan d'une story ou d'un post (iOS `BackgroundAudioAnnouncement` et
 * `BackgroundSoundBadge.announcement(for:)`) : rien, la piste ORIGINALE de l'auteur (note + onde), ou un CRÉDIT de
 * bibliothèque — dont les métadonnées peuvent manquer (cache froid) sans jamais dégénérer en [Original], qui mentirait
 * sur la provenance.
 */
public sealed interface BackgroundAudioAnnouncement {
    public data object None : BackgroundAudioAnnouncement

    public data object Original : BackgroundAudioAnnouncement

    public data class Credit(
        val title: String?,
        val username: String?,
        val durationSeconds: Double?,
        val releasedAtEpochMillis: Long?,
    ) : BackgroundAudioAnnouncement

    /** Le bouton de coupure existe si et seulement si une piste existe : le même prédicat que l'annonce (iOS `showsMuteButton`). */
    public val showsMuteControl: Boolean get() = this !is None

    public companion object {
        /** Ce qui suit la note quand rien du son n'est connu. */
        public const val UNKNOWN_CREDIT: String = "—"

        private const val CREDIT_FONT_CAP_SP: Float = 18f
        private const val LIBRARY = "library"

        /**
         * Priorité des sources : le son du document v3, puis la piste de fond de la scène (`isBackground`), puis l'identifiant
         * de fond hérité. La voix seule n'est pas un fond audio. Titre, auteur, durée et date viennent de la piste de fond.
         */
        public fun of(effects: StoryEffects?): BackgroundAudioAnnouncement {
            effects ?: return None
            val trace = effects.audioPlayerObjects?.firstOrNull { it.isBackground == true }
            val borrowed = Credit(
                title = trace?.name,
                username = trace?.soundAuthorUsername,
                durationSeconds = trace?.duration?.toDouble(),
                releasedAtEpochMillis = trace?.soundCreatedAt?.let(::parseInstant),
            )
            val documentSound = effects.canvas?.sound
            if (documentSound != null) return if (documentSound.source.t == LIBRARY) borrowed else Original
            if (trace != null) return if (trace.soundId.isNullOrBlank()) Original else borrowed
            return if (effects.backgroundAudioId.isNullOrBlank()) None else borrowed
        }

        /** « titre · @auteur », sinon « @auteur · date du son », sinon « — » (iOS `AudioChipDisplay.creditLine`). */
        public fun creditText(
            credit: Credit,
            locale: Locale = Locale.getDefault(),
            zone: ZoneId = ZoneId.systemDefault(),
        ): String {
            val title = credit.title?.trim()?.takeIf { it.isNotEmpty() }
            val author = credit.username?.trim()?.trimStart('@')?.takeIf { it.isNotEmpty() }?.let { "@$it" }
            val date = if (title == null && author != null) credit.releasedAtEpochMillis?.let { creditDate(it, locale, zone) } else null
            return listOfNotNull(title, author, date).joinToString(" · ").ifEmpty { UNKNOWN_CREDIT }
        }

        /** Ce que TalkBack dit : la nature de la piste, puis son crédit s'il est connu. */
        public fun spokenDescription(
            announcement: BackgroundAudioAnnouncement,
            trackLabel: String,
            locale: Locale = Locale.getDefault(),
            zone: ZoneId = ZoneId.systemDefault(),
        ): String = when (announcement) {
            None -> ""
            Original -> trackLabel
            is Credit -> creditText(announcement, locale, zone).let { if (it == UNKNOWN_CREDIT) trackLabel else "$trackLabel · $it" }
        }

        /** La taille du crédit suit la taille de texte choisie, plafonnée à 18 (très grande police : l'hôte le passe sous le nom). */
        public fun creditFontSizeSp(scaledSp: Float): Float = minOf(scaledSp, CREDIT_FONT_CAP_SP)

        private fun creditDate(epochMillis: Long, locale: Locale, zone: ZoneId): String =
            DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale).withZone(zone).format(Instant.ofEpochMilli(epochMillis))

        private fun parseInstant(raw: String): Long? = runCatching { Instant.parse(raw).toEpochMilli() }.getOrNull()
    }
}
