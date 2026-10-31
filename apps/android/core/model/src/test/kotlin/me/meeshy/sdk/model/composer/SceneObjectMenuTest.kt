package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.SceneObjectMenu.Action
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class SceneObjectMenuTest {

    private fun offered(
        isLocked: Boolean = false,
        isBackground: Boolean = false,
        sharesPlaneWithAnother: Boolean = false,
        hasEditor: Boolean = false,
        canLeaveScene: Boolean = false,
        hasTrimmableSource: Boolean = false,
        canBecomeBackground: Boolean = false,
        sceneHasBackground: Boolean = false,
    ) = SceneObjectMenu.offered(
        SceneObjectMenu.Subject(
            isLocked, isBackground, sharesPlaneWithAnother, hasEditor, canLeaveScene,
            hasTrimmableSource, canBecomeBackground, sceneHasBackground,
        ),
    )

    @Test
    fun `un objet seul de son plan sans editeur n'offre que dupliquer et supprimer`() {
        assertThat(offered()).containsExactly(Action.DUPLICATE, Action.DELETE).inOrder()
    }

    @Test
    fun `l'empilement n'est servi qu'a un objet qui partage son plan`() {
        assertThat(offered(sharesPlaneWithAnother = true))
            .containsExactly(
                Action.DUPLICATE, Action.BRING_TO_FRONT, Action.BRING_FORWARD, Action.SEND_BACKWARD, Action.SEND_TO_BACK, Action.DELETE,
            ).inOrder()
    }

    @Test
    fun `un fond n'empile pas meme s'il partage son plan`() {
        assertThat(offered(isBackground = true, sharesPlaneWithAnother = true))
            .containsExactly(Action.DUPLICATE, Action.DELETE).inOrder()
    }

    @Test
    fun `modifier suit l'editeur que l'hote a cable`() {
        assertThat(offered(hasEditor = true).first()).isEqualTo(Action.EDIT)
    }

    @Test
    fun `rogner suit modifier quand l'objet a une source`() {
        assertThat(offered(hasEditor = true, hasTrimmableSource = true).take(2))
            .containsExactly(Action.EDIT, Action.TRIM).inOrder()
    }

    @Test
    fun `sortir de la scene est servie a un fond aussi mais jamais par defaut`() {
        assertThat(offered()).doesNotContain(Action.LEAVE_SCENE)
        assertThat(offered(isBackground = true, canLeaveScene = true)).contains(Action.LEAVE_SCENE)
    }

    @Test
    fun `l'ordre complet suit l'empilement avant la sortie et la suppression en dernier`() {
        val all = offered(
            sharesPlaneWithAnother = true, hasEditor = true, canLeaveScene = true,
            hasTrimmableSource = true, canBecomeBackground = true,
        )
        assertThat(all).containsExactly(
            Action.EDIT, Action.TRIM, Action.DUPLICATE, Action.BRING_TO_FRONT, Action.BRING_FORWARD, Action.SEND_BACKWARD, Action.SEND_TO_BACK,
            Action.LEAVE_SCENE, Action.SET_AS_BACKGROUND, Action.DELETE,
        ).inOrder()
    }

    @Test
    fun `le mot dit s'il y a un fond a remplacer`() {
        assertThat(offered(canBecomeBackground = true, sceneHasBackground = true))
            .contains(Action.REPLACE_BACKGROUND)
        assertThat(offered(canBecomeBackground = true, sceneHasBackground = true))
            .doesNotContain(Action.SET_AS_BACKGROUND)
    }

    @Test
    fun `un fond ne devient pas fond`() {
        assertThat(offered(isBackground = true, canBecomeBackground = true))
            .containsNoneOf(Action.SET_AS_BACKGROUND, Action.REPLACE_BACKGROUND)
    }

    @Test
    fun `un objet verrouille ne s'edite ni ne se duplique ni ne se supprime mais s'empile`() {
        assertThat(
            offered(
                isLocked = true, sharesPlaneWithAnother = true, hasEditor = true, canLeaveScene = true,
                hasTrimmableSource = true, canBecomeBackground = true,
            ),
        ).containsExactly(Action.BRING_TO_FRONT, Action.BRING_FORWARD, Action.SEND_BACKWARD, Action.SEND_TO_BACK).inOrder()
    }

    @Test
    fun `dupliquer disparait quand la scene est pleine pour cette famille`() {
        val full = SceneObjectMenu.offered(SceneObjectMenu.Subject(canDuplicate = false))
        assertThat(full).containsExactly(Action.DELETE)
    }

    @Test
    fun `seule la suppression est destructrice`() {
        assertThat(Action.entries.filter { it.isDestructive }).containsExactly(Action.DELETE)
    }
}
