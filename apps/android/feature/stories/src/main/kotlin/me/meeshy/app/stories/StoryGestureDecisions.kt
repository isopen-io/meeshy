package me.meeshy.app.stories

/**
 * État d'un toucher en cours sur la scène du lecteur — iOS `StoryGestureContext`. Pur : la
 * couche gestuelle le remplit, [StoryGestureDecisions] décide, sans rien savoir de Compose.
 */
internal data class StoryGestureContext(
    val holdActive: Boolean = false,
    val isPaused: Boolean = false,
    val isResumingTap: Boolean = false,
    val isComposerEngaged: Boolean = false,
    val isSurfaceOpen: Boolean = false,
    val didExceedSlop: Boolean = false,
)

/** Ce que la couche gestuelle applique après une décision — iOS `StoryGestureAction`. */
internal enum class StoryGestureAction {
    None,
    DismissComposer,
    CloseSurface,
    ResumeFromPause,
    ConfirmLongPressPause,
    NavigatePrevious,
    NavigateNext,
    TogglePause,
}

/**
 * Décisions de la scène du lecteur — iOS `StoryGestureDecisions`. Les bords (30 %) naviguent sans
 * attendre un double toucher, la bande centrale appartient au double toucher (pause / lecture),
 * un appui de 200 ms fige, un glissé de plus de [SLOP_DP] n'est pas un tap.
 */
internal object StoryGestureDecisions {
    const val SLOP_DP: Float = 14f

    /** Un bord reprend une story figée au toucher ; le centre non, il appartient au double toucher. */
    fun decideTouchDown(context: StoryGestureContext, x: Float, width: Float): StoryGestureAction = when {
        context.isComposerEngaged || context.isSurfaceOpen -> StoryGestureAction.None
        !context.isPaused -> StoryGestureAction.None
        StoryTapZone.of(x, width) == StoryTapZone.Center -> StoryGestureAction.None
        else -> StoryGestureAction.ResumeFromPause
    }

    /** Le relâchement : le composeur et les surfaces ouvertes passent avant toute navigation. */
    fun decideTouchUp(
        context: StoryGestureContext,
        x: Float,
        width: Float,
        elapsedMillis: Long,
        holdMillis: Long = STORY_HOLD_MILLIS,
    ): StoryGestureAction = when {
        context.isComposerEngaged -> StoryGestureAction.DismissComposer
        context.isResumingTap -> StoryGestureAction.None
        context.isSurfaceOpen -> StoryGestureAction.CloseSurface
        context.holdActive -> StoryGestureAction.ConfirmLongPressPause
        context.didExceedSlop -> StoryGestureAction.None
        elapsedMillis >= holdMillis -> StoryGestureAction.None
        else -> when (StoryTapZone.of(x, width)) {
            StoryTapZone.Previous -> StoryGestureAction.NavigatePrevious
            StoryTapZone.Next -> StoryGestureAction.NavigateNext
            StoryTapZone.Center -> StoryGestureAction.None
        }
    }

    /** Double toucher : actif dans la bande centrale seulement. */
    fun decideDoubleTap(context: StoryGestureContext, x: Float, width: Float): StoryGestureAction = when {
        context.isComposerEngaged -> StoryGestureAction.DismissComposer
        context.isSurfaceOpen -> StoryGestureAction.CloseSurface
        StoryTapZone.of(x, width) != StoryTapZone.Center -> StoryGestureAction.None
        else -> StoryGestureAction.TogglePause
    }
}
