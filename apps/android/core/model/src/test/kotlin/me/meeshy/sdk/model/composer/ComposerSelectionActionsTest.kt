package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.ComposerSelectionAction.DUPLICATE
import me.meeshy.sdk.model.composer.ComposerSelectionAction.EDIT
import me.meeshy.sdk.model.composer.ComposerSelectionAction.ORDER
import me.meeshy.sdk.model.composer.ComposerSelectionAction.REMOVE
import me.meeshy.sdk.model.composer.ComposerSelectionAction.TIME
import me.meeshy.sdk.model.composer.SceneObjectMenu.Action
import org.junit.Test

/**
 * La barre d'actions d'un élément sélectionné (#13836) : Modifier · Ordre · Dupliquer · Temps · Retirer, chacune servie
 * seulement si elle a un effet pour l'objet, et le menu de l'appui long n'en est qu'un raccourci — jamais une action que
 * la barre n'a pas.
 */
class ComposerSelectionActionsTest {
    private fun served(
        offered: List<Action> = emptyList(),
        editable: Boolean = false,
        timed: Boolean = false,
        sceneAnimated: Boolean = false,
    ) = ComposerSelectionActions.served(ComposerSelectionActions.Input(offered, editable, timed, sceneAnimated))

    private val textAmongOthers = SceneObjectMenu.offered(
        SceneObjectMenu.Subject(sharesPlaneWithAnother = true, hasEditor = true),
    )

    @Test
    fun `a text sharing the plane serves the five actions of the mockup, in its order, once the scene is animated`() {
        assertThat(served(textAmongOthers, editable = true, timed = true, sceneAnimated = true))
            .containsExactly(EDIT, ORDER, DUPLICATE, TIME, REMOVE).inOrder()
    }

    @Test
    fun `timing is served only for an animated scene, and only to an object that has a window of its own`() {
        assertThat(served(textAmongOthers, editable = true, timed = true, sceneAnimated = false)).doesNotContain(TIME)
        assertThat(served(listOf(Action.DELETE), editable = true, timed = false, sceneAnimated = true)).doesNotContain(TIME)
    }

    @Test
    fun `a lone sticker is not ordered, and is edited only when its swap is wired`() {
        val lone = SceneObjectMenu.offered(SceneObjectMenu.Subject())
        assertThat(served(lone)).containsExactly(DUPLICATE, REMOVE).inOrder()
        assertThat(served(lone, editable = true)).containsExactly(EDIT, DUPLICATE, REMOVE).inOrder()
    }

    @Test
    fun `a media becoming the background is edited in its sheet, never a sixth action of the bar`() {
        val media = listOf(Action.SET_AS_BACKGROUND, Action.DELETE)
        assertThat(served(media, editable = true)).containsExactly(EDIT, REMOVE).inOrder()
        assertThat(ComposerSelectionActions.editSheetActions(media)).containsExactly(Action.SET_AS_BACKGROUND)
        assertThat(ComposerSelectionActions.editSheetActions(listOf(Action.REPLACE_BACKGROUND, Action.DELETE)))
            .containsExactly(Action.REPLACE_BACKGROUND)
    }

    @Test
    fun `a locked object serves nothing but its timing`() {
        val locked = SceneObjectMenu.offered(SceneObjectMenu.Subject(isLocked = true, sharesPlaneWithAnother = true))
        assertThat(served(locked, timed = true, sceneAnimated = true)).containsExactly(ORDER, TIME).inOrder()
    }

    @Test
    fun `order opens front, forward, backward and back, as the object offers them`() {
        assertThat(ComposerSelectionActions.orderChoices(textAmongOthers))
            .containsExactly(Action.BRING_TO_FRONT, Action.BRING_FORWARD, Action.SEND_BACKWARD, Action.SEND_TO_BACK).inOrder()
        assertThat(ComposerSelectionActions.orderChoices(listOf(Action.DELETE))).isEmpty()
    }

    @Test
    fun `every action of a long-press menu lands on an action the bar serves for the same object`() {
        val subjects = listOf(
            SceneObjectMenu.Subject(),
            SceneObjectMenu.Subject(hasEditor = true),
            SceneObjectMenu.Subject(sharesPlaneWithAnother = true, hasEditor = true),
            SceneObjectMenu.Subject(canDuplicate = false, hasTrimmableSource = true, canLeaveScene = true),
            SceneObjectMenu.Subject(canBecomeBackground = true, sceneHasBackground = true),
            SceneObjectMenu.Subject(isLocked = true, sharesPlaneWithAnother = true),
        )
        subjects.forEach { subject ->
            val menu = SceneObjectMenu.offered(subject)
            val bar = served(menu)
            menu.forEach { action -> assertThat(bar).contains(ComposerSelectionActions.of(action)) }
        }
    }

    @Test
    fun `removing is the only destructive action of the bar`() {
        assertThat(ComposerSelectionAction.entries.filter { it.isDestructive }).containsExactly(REMOVE)
    }
}
