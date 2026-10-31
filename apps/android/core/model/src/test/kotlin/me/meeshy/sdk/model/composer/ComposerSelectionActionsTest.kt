package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.ComposerSelectionAction.DUPLICATE
import me.meeshy.sdk.model.composer.ComposerSelectionAction.EDIT
import me.meeshy.sdk.model.composer.ComposerSelectionAction.REMOVE
import me.meeshy.sdk.model.composer.ComposerSelectionAction.TIME
import me.meeshy.sdk.model.composer.SceneObjectMenu.Action
import org.junit.Test

/**
 * La barre d'actions d'un élément sélectionné (#13836, #13917) : Modifier · Dupliquer · Temps · Retirer, chacune servie
 * seulement si elle a un effet pour l'objet, et le menu de l'appui long n'en est qu'un raccourci — jamais une action que
 * la barre n'a pas.
 */
class ComposerSelectionActionsTest {
    private fun served(
        offered: List<Action> = emptyList(),
        editable: Boolean = false,
        timed: Boolean = false,
        locked: Boolean = false,
    ) = ComposerSelectionActions.served(ComposerSelectionActions.Input(offered, editable, timed, locked))

    private val text = SceneObjectMenu.offered(SceneObjectMenu.Subject(hasEditor = true))

    @Test
    fun `a text serves the four actions of the mockup, in its order, the scene left still`() {
        assertThat(served(text, editable = true, timed = true))
            .containsExactly(EDIT, DUPLICATE, TIME, REMOVE).inOrder()
    }

    @Test
    fun `timing is served to every object placed on the scene, never to a background that lasts the whole slide`() {
        assertThat(served(listOf(Action.DUPLICATE, Action.DELETE), editable = true, timed = true)).contains(TIME)
        assertThat(served(listOf(Action.DELETE), editable = true, timed = false)).doesNotContain(TIME)
    }

    @Test
    fun `a sticker is edited only when its swap is wired`() {
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
    fun `a locked object serves nothing, never timed, as on iOS`() {
        val locked = SceneObjectMenu.offered(SceneObjectMenu.Subject(isLocked = true))
        assertThat(served(locked, timed = true, locked = true)).isEmpty()
    }

    @Test
    fun `every action of a long-press menu lands on an action the bar serves for the same object`() {
        val subjects = listOf(
            SceneObjectMenu.Subject(),
            SceneObjectMenu.Subject(hasEditor = true),
            SceneObjectMenu.Subject(canDuplicate = false, hasTrimmableSource = true, canLeaveScene = true),
            SceneObjectMenu.Subject(canBecomeBackground = true, sceneHasBackground = true),
            SceneObjectMenu.Subject(isLocked = true),
        )
        subjects.forEach { subject ->
            val menu = SceneObjectMenu.offered(subject)
            val bar = served(menu)
            menu.forEach { action -> assertThat(bar).contains(ComposerSelectionActions.of(action)) }
        }
    }

    @Test
    fun `the bar keeps Edit, Duplicate, Time and Remove, and no Order since touching an object brings it to the front`() {
        assertThat(ComposerSelectionAction.entries.map { it.name }).containsExactly("EDIT", "DUPLICATE", "TIME", "REMOVE").inOrder()
    }

    @Test
    fun `removing is the only destructive action of the bar`() {
        assertThat(ComposerSelectionAction.entries.filter { it.isDestructive }).containsExactly(REMOVE)
    }
}
