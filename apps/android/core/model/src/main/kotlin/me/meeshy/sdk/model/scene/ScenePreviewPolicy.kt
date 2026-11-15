package me.meeshy.sdk.model.scene

/** Ce que le canvas fait d'une vidéo pendant l'aperçu de la frise. */
public sealed interface PreviewVideoCommand {
    /** Scrub : lecteur en pause, calé par un seek TOLÉRANT (un seek exact à 60 Hz gèle sur le GOP). */
    public data class SeekTolerant(val positionMs: Long) : PreviewVideoCommand

    /** Entrée en lecture : relancé UNE fois, calé sur la tête. */
    public data class RestartAligned(val positionMs: Long) : PreviewVideoCommand

    /** Tick de lecture : le lecteur joue nativement, aucun re-seek. */
    public data object None : PreviewVideoCommand
}

/**
 * La sémantique de l'aperçu de frise (iOS `StoryCanvasUIView+TimelinePreview`) : le canvas EST le moniteur, il rend la slide
 * à l'instant de la tête avec la sémantique lecture ; l'audio vient du moteur de frise, les lecteurs du canvas sont muets ;
 * hors fenêtre un objet est caché en lecture et fantôme à 0,25 à l'arrêt.
 */
public object ScenePreviewPolicy {

    public fun renderMode(editing: Boolean, previewActive: Boolean): SceneRenderMode =
        if (editing && previewActive) SceneRenderMode.PLAY else if (editing) SceneRenderMode.EDIT else SceneRenderMode.PLAY

    public fun audioMuted(authorMuted: Boolean, previewActive: Boolean): Boolean = authorMuted || previewActive

    /** L'opacité du fantôme : seulement à l'arrêt dans l'aperçu ; `null` : hors fenêtre, rien ne se peint. */
    public fun ghostOpacity(previewActive: Boolean, playing: Boolean): Double? =
        if (previewActive && !playing) SCENE_GHOST_OPACITY else null

    /**
     * L'opacité d'un objet à l'instant [seconds] : 1 dans sa fenêtre, [ghostOpacity] hors fenêtre, 0 si caché ; `1` hors
     * aperçu (le mode édition montre tout). [endSeconds] `null` : jusqu'à la fin.
     */
    public fun objectOpacity(
        previewActive: Boolean,
        playing: Boolean,
        seconds: Double,
        startSeconds: Double,
        endSeconds: Double?,
    ): Double {
        if (!previewActive) return 1.0
        val inWindow = seconds >= startSeconds && (endSeconds == null || seconds < endSeconds)
        return if (inWindow) 1.0 else ghostOpacity(previewActive, playing) ?: 0.0
    }

    /**
     * Le geste vidéo : à l'arrêt ou en scrub, un seek tolérant ; une transition arrêt -> lecture relance calé ; ensuite les
     * ticks ne touchent plus au lecteur.
     */
    public fun videoCommand(playing: Boolean, wasPlaying: Boolean, playheadMs: Long): PreviewVideoCommand = when {
        !playing -> PreviewVideoCommand.SeekTolerant(playheadMs)
        !wasPlaying -> PreviewVideoCommand.RestartAligned(playheadMs)
        else -> PreviewVideoCommand.None
    }
}
