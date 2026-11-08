package me.meeshy.app.stories

import androidx.annotation.StringRes
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.scene.SceneObjectMenuPlan.Action

/**
 * Le menu d'appui long et les actions TalkBack d'un objet de la scène, vus de l'écran : le libellé de chaque
 * action du plan (`SceneObjectMenuPlan`). La règle « absente, jamais grisée » est tenue par le plan ; ici il n'y
 * a qu'un mot par action, dans l'ordre que le plan a rendu.
 */
internal object StoryElementMenu {

    @StringRes
    fun labelRes(action: Action): Int = when (action) {
        Action.EDIT -> R.string.story_canvas_action_edit
        Action.TRIM -> R.string.story_canvas_action_trim
        Action.DUPLICATE -> R.string.story_canvas_action_duplicate
        Action.BRING_FORWARD -> R.string.story_canvas_action_bringForward
        Action.SEND_BACKWARD -> R.string.story_canvas_action_sendBackward
        Action.LEAVE_SCENE -> R.string.story_canvas_action_leaveScene
        Action.SET_AS_BACKGROUND -> R.string.stories_composer_background_media_set
        Action.REPLACE_BACKGROUND -> R.string.story_canvas_action_replaceBackground
        Action.DELETE -> R.string.story_canvas_action_delete
    }

    /** Les actions que l'écran sait EXÉCUTER pour une famille : le reste est absent des actions TalkBack. */
    fun executable(kind: me.meeshy.sdk.model.scene.MeeshySceneObject.Kind, offered: List<Action>): List<Action> {
        val served = when (kind) {
            me.meeshy.sdk.model.scene.MeeshySceneObject.Kind.TEXT -> setOf(Action.EDIT, Action.DUPLICATE, Action.DELETE)
            me.meeshy.sdk.model.scene.MeeshySceneObject.Kind.STICKER -> setOf(Action.DUPLICATE, Action.DELETE)
            else -> emptySet()
        }
        return offered.filter { it in served }
    }
}
