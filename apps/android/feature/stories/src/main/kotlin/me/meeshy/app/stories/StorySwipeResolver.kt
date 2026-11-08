package me.meeshy.app.stories

/**
 * The navigation intent a committed drag on the story viewer resolves to. The decision itself
 * lives in [StoryGroupSwipeDecision] (horizontal) and [StoryVerticalGestureDecisions] (vertical).
 */
enum class StorySwipeAction { NextGroup, PreviousGroup, Dismiss, None }

/**
 * Traduit le verdict d'un glissé vertical en intention de navigation : seule la fermeture quitte le lecteur. Le plein
 * écran, la fermeture d'une surface et le retour en ressort relèvent de la couche de glissé, jamais de la navigation.
 */
internal fun StoryVerticalGestureAction.toSwipeAction(): StorySwipeAction = when (this) {
    StoryVerticalGestureAction.DismissViewer -> StorySwipeAction.Dismiss
    StoryVerticalGestureAction.Cancel,
    StoryVerticalGestureAction.EnterFullscreen,
    StoryVerticalGestureAction.ExitFullscreen,
    StoryVerticalGestureAction.None,
    StoryVerticalGestureAction.DismissActiveFeature,
    -> StorySwipeAction.None
}
