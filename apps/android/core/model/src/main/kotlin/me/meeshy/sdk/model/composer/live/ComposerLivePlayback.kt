package me.meeshy.sdk.model.composer.live

import kotlin.math.roundToLong
import me.meeshy.sdk.model.media.MediaTrimBounds

/** Ce que la scène joue : une image animée (vidéo) ou un son seul. */
enum class ComposerLiveKind { VIDEO, AUDIO }

/** Un média que la scène joue : son identifiant, sa nature, et s'il est le fond de la diapo. */
data class ComposerLiveSubject(val id: String, val kind: ComposerLiveKind, val background: Boolean)

/** La fenêtre jouée DANS la source, en millisecondes ; [endMs] `null` : jusqu'au bout. */
data class ComposerLiveWindow(val startMs: Long, val endMs: Long?) {
    companion object {
        val WHOLE = ComposerLiveWindow(0, null)
    }
}

/**
 * La lecture en direct du compositeur (#13863, loi 6 du modèle de lecture : le player est l'aperçu ; grammaire d'édition,
 * lot A-E3, #13973). La scène joue en continu ce que la lecture de la story jouera : le fond vidéo, chaque vidéo posée et
 * chaque son de la diapo, chacun dans sa fenêtre et à son volume, en boucle — comme la scène d'édition d'iOS
 * (`StoryCanvasUIView.applyEditPlayback`). La sélection ne fait que désigner ce qu'on édite : chaque image du geste de
 * Couper déplace la tête de SON lecteur là où l'auteur regarde — la poignée de début montre le nouveau début, celle de
 * fin les derniers instants avant la nouvelle fin. Un lecteur n'est jamais recréé pendant le geste : la fenêtre est tenue
 * par [rewindTo], pas par une nouvelle source.
 */
object ComposerLivePlayback {

    /** Ce que la tête rejoue avant une fin qu'on déplace. */
    const val END_PREVIEW_MS = 1_500L

    /** La tolérance sous le début avant de reboucler : une recherche peut se poser un peu avant l'image demandée. */
    const val LOOP_SLACK_MS = 250L

    /**
     * Les vidéos qu'un appareil décode ensemble sans saccade : au-delà, une vidéo garde son image de début, immobile.
     * Le plafond de la scène (50 objets) dépasse de loin ce que tient le décodeur matériel d'un téléphone.
     */
    const val MAX_LIVE_VIDEOS = 3

    /**
     * Ce qui joue, dans l'ordre de la diapo : tous les sons, et les vidéos dans la limite de [MAX_LIVE_VIDEOS] — la vidéo
     * qu'on édite ([selectedId]) d'abord, puis le fond, puis l'ordre de pose.
     */
    fun playing(subjects: List<ComposerLiveSubject>, selectedId: String?): List<ComposerLiveSubject> {
        val videos = subjects.filter { it.kind == ComposerLiveKind.VIDEO }
        val kept = videos.sortedBy { video ->
            when {
                video.id == selectedId -> 0
                video.background -> 1
                else -> 2
            }
        }.take(MAX_LIVE_VIDEOS).toSet()
        return subjects.filter { it.kind == ComposerLiveKind.AUDIO || it in kept }
    }

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

    /**
     * La scène joue tant que l'écran est au premier plan et que l'étagère des sons, qui fait écouter les siens, est
     * fermée — quoi qu'on ait sélectionné.
     */
    fun plays(screenResumed: Boolean, shelfOpen: Boolean): Boolean = screenResumed && !shelfOpen

    private const val MILLIS = 1_000.0
}
