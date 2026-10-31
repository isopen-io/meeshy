package me.meeshy.sdk.model.composer.live

import kotlin.math.roundToLong
import me.meeshy.sdk.model.media.MediaTrimBounds

/** Ce que la sélection fait jouer : une image animée (vidéo) ou un son seul. */
enum class ComposerLiveKind { VIDEO, AUDIO }

/** Le média que la sélection fait jouer : son identifiant, sa nature, et s'il est le fond de la diapo. */
data class ComposerLiveSubject(val id: String, val kind: ComposerLiveKind, val background: Boolean)

/** La fenêtre jouée DANS la source, en millisecondes ; [endMs] `null` : jusqu'au bout. */
data class ComposerLiveWindow(val startMs: Long, val endMs: Long?) {
    companion object {
        val WHOLE = ComposerLiveWindow(0, null)
    }
}

/**
 * La lecture en direct du compositeur (grammaire d'édition, lot A-E3, #13973 ; R6 : chaque réglage se voit en temps réel).
 * UN lecteur, piloté par la sélection : il joue le média sélectionné dans sa fenêtre et à son volume, et chaque image du
 * geste de Couper déplace la tête là où l'auteur regarde — la poignée de début montre le nouveau début, celle de fin les
 * derniers instants avant la nouvelle fin. Le lecteur n'est jamais recréé pendant le geste : la fenêtre est tenue par
 * [rewindTo], pas par une nouvelle source.
 */
object ComposerLivePlayback {

    /** Ce que la tête rejoue avant une fin qu'on déplace. */
    const val END_PREVIEW_MS = 1_500L

    /** La tolérance sous le début avant de reboucler : une recherche peut se poser un peu avant l'image demandée. */
    const val LOOP_SLACK_MS = 250L

    /**
     * Ce que la scène sélectionne : le fond vidéo de la diapo, le média sélectionné (et s'il est une vidéo), le son
     * sélectionné (et s'il a une adresse à jouer).
     */
    data class Selection(
        val backgroundVideoId: String?,
        val mediaId: String?,
        val mediaIsVideo: Boolean,
        val soundId: String?,
        val soundPlayable: Boolean,
    )

    fun subject(selection: Selection): ComposerLiveSubject? {
        selection.soundId?.let { id -> return ComposerLiveSubject(id, ComposerLiveKind.AUDIO, background = false).takeIf { selection.soundPlayable } }
        val media = selection.mediaId?.takeIf { selection.mediaIsVideo } ?: return null
        return ComposerLiveSubject(media, ComposerLiveKind.VIDEO, background = media == selection.backgroundVideoId)
    }

    /** Une seule lecture à la fois : le son de fond se tait tant qu'un son sélectionné joue à sa place. */
    fun backgroundSoundYields(subject: ComposerLiveSubject?): Boolean = subject?.kind == ComposerLiveKind.AUDIO

    fun window(bounds: MediaTrimBounds?): ComposerLiveWindow =
        bounds?.let { ComposerLiveWindow((it.start * MILLIS).roundToLong(), (it.end * MILLIS).roundToLong()) } ?: ComposerLiveWindow.WHOLE

    /**
     * Où la tête va quand la fenêtre change : au début pour la première fenêtre, une poignée de début ou une fenêtre qui
     * glisse ; [END_PREVIEW_MS] avant la nouvelle fin quand seule la fin bouge ; nulle part quand rien ne bouge.
     */
    fun seekOnChange(previous: ComposerLiveWindow?, next: ComposerLiveWindow): Long? {
        if (previous == next) return null
        if (previous == null || previous.startMs != next.startMs) return next.startMs
        val end = next.endMs ?: return next.startMs
        return maxOf(next.startMs, end - END_PREVIEW_MS)
    }

    /** La tête sortie de la fenêtre (au bout, ou rebouclée au début de la source) revient à son début ; `null` : elle y est. */
    fun rewindTo(positionMs: Long, window: ComposerLiveWindow): Long? {
        val pastEnd = window.endMs?.let { positionMs >= it } == true
        val beforeStart = positionMs < window.startMs - LOOP_SLACK_MS
        return window.startMs.takeIf { pastEnd || beforeStart }
    }

    /** Le volume de la piste dans l'échelle du lecteur (0…1), muet à 0, une valeur illisible à plein. */
    fun volume(trackVolume: Float, muted: Boolean): Float = when {
        muted -> 0f
        trackVolume.isNaN() -> 1f
        else -> trackVolume.coerceIn(0f, 1f)
    }

    /** Le lecteur joue tant qu'un média est sélectionné, l'écran au premier plan et l'étagère des sons fermée. */
    fun plays(subject: ComposerLiveSubject?, screenResumed: Boolean, shelfOpen: Boolean): Boolean =
        subject != null && screenResumed && !shelfOpen

    private const val MILLIS = 1_000.0
}
