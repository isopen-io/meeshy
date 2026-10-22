package me.meeshy.sdk.model.fullscreen

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** Loi de pages du plein écran audio : fenêtre de rendu et moment où la piste change. */
public object AudioFullscreenPaging {

    /** La page visible et ses deux voisines. */
    public const val RENDER_RADIUS: Int = 1

    /** Temps qu'une page reste posée avant que sa piste parte. */
    public const val SETTLE_DELAY_MILLIS: Long = 160L

    public fun index(pageId: String?, ids: List<String>): Int? =
        pageId?.let { ids.indexOf(it).takeIf { index -> index >= 0 } }

    /** Une page hors fenêtre n'est pas rendue : les pages traversées sont libérées. */
    public fun renders(index: Int, current: Int): Boolean = abs(index - current) <= RENDER_RADIUS

    /** La page d'entrée part sans attendre ; une page traversée au doigt attend d'être posée. */
    public fun playbackDelayMillis(turnedTo: Boolean): Long = if (turnedTo) SETTLE_DELAY_MILLIS else 0L

    /** Une piste lancée pour une page qui n'est plus la page posée est annulée. */
    public fun isStale(startedFor: String, currentPageId: String?): Boolean = startedFor != currentPageId
}

/** Ordre et enchaînement des vocaux : la date de réception, rien d'autre. */
public object AudioFullscreenSequence {

    public fun <T> ordered(items: List<T>, receivedAtMillis: (T) -> Long): List<T> =
        items.withIndex()
            .sortedWith(compareBy({ receivedAtMillis(it.value) }, { it.index }))
            .map { it.value }

    public fun next(afterId: String, ids: List<String>): String? {
        val index = ids.indexOf(afterId)
        return if (index < 0 || index + 1 >= ids.size) null else ids[index + 1]
    }

    public fun previous(beforeId: String, ids: List<String>): String? {
        val index = ids.indexOf(beforeId)
        return if (index <= 0) null else ids[index - 1]
    }

    public fun upcoming(afterId: String, ids: List<String>): List<String> {
        val index = ids.indexOf(afterId)
        return if (index < 0) emptyList() else ids.drop(index + 1)
    }

    /** Page à rejoindre quand la piste active change sans l'écran ; null si c'est lui qui l'a demandée. */
    public fun pageToFollow(
        activeAttachmentId: String?,
        currentPageId: String?,
        ids: List<String>,
        requestedByScreen: String? = null,
    ): String? {
        val active = activeAttachmentId ?: return null
        if (active == currentPageId || active == requestedByScreen || active !in ids) return null
        return active
    }
}

public enum class AudioFullscreenArrangement { STACKED, SIDE_BY_SIDE }

/** Disposition d'une page audio, mesurée sur le conteneur réel (dp). */
public data class AudioFullscreenLayout(
    val arrangement: AudioFullscreenArrangement,
    val heroDiameter: Float,
    val transcriptMaxHeight: Float,
    val contentMaxWidth: Float,
    val lyricSize: Float,
) {
    public companion object {
        public const val MIN_HERO: Float = 72f
        public const val MAX_HERO: Float = 168f
        public const val MIN_TRANSCRIPT: Float = 72f
        public const val MAX_TRANSCRIPT: Float = 240f
        public const val READABLE_WIDTH: Float = 600f
        public const val STACK_SPACING: Float = 12f
        public const val MIN_LYRICS: Float = 120f
        public const val BASE_TRANSCRIPT_SIZE: Float = 14f
        public const val LYRIC_SCALE: Float = 2.4f

        /** Largeur à partir de laquelle (tablette, pliable ouvert) on passe à deux colonnes. */
        public const val TWO_COLUMN_WIDTH: Float = 840f

        private const val SHORT_LANDSCAPE_HEIGHT: Float = 560f

        /** Ce que la page empilée occupe sans le cadran. */
        public const val STACKED_CHROME: Float =
            52f + 44f + 64f + MIN_LYRICS + 60f + STACK_SPACING * 4

        public fun stackedMinimumHeight(heroDiameter: Float): Float =
            STACKED_CHROME + heroDiameter + AudioDialGeometry.BAND * 2

        public fun lyricSize(forWidth: Float): Float =
            clamp((forWidth * 0.078f).roundToInt().toFloat(), BASE_TRANSCRIPT_SIZE * 1.6f, (BASE_TRANSCRIPT_SIZE * LYRIC_SCALE).roundToInt().toFloat())

        public fun bottomInset(safeArea: Float): Float = max(safeArea, 28f) + 8f

        public fun lyricAnchor(header: Float, footer: Float, height: Float): Float {
            if (height <= 0f) return 0.5f
            val free = max(0f, height - header - footer)
            return ((header + free / 3f) / height).coerceIn(0f, 1f)
        }

        /** Le portrait prend ce qui reste, jamais ce qui manque. */
        public fun resolve(width: Float, height: Float): AudioFullscreenLayout {
            val sideBySide = (width > height && height < SHORT_LANDSCAPE_HEIGHT) || width >= TWO_COLUMN_WIDTH
            val room = height - STACKED_CHROME - AudioDialGeometry.BAND * 2
            val hero = if (sideBySide && width > height) clamp(height * 0.30f, MIN_HERO, MAX_HERO)
            else clamp(room * 0.36f, MIN_HERO, MAX_HERO)
            val transcript = clamp(height * (if (sideBySide) 0.42f else 0.20f), MIN_TRANSCRIPT, MAX_TRANSCRIPT)
            return AudioFullscreenLayout(
                arrangement = if (sideBySide) AudioFullscreenArrangement.SIDE_BY_SIDE else AudioFullscreenArrangement.STACKED,
                heroDiameter = hero.roundToInt().toFloat(),
                transcriptMaxHeight = transcript.roundToInt().toFloat(),
                contentMaxWidth = READABLE_WIDTH,
                lyricSize = if (sideBySide && width > height) BASE_TRANSCRIPT_SIZE * 2
                else lyricSize(min(width, READABLE_WIDTH)),
            )
        }

        private fun clamp(value: Float, lower: Float, upper: Float): Float = min(max(value, lower), upper)
    }
}
