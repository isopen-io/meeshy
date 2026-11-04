package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class InlineEditTouchPolicyTest {
    private fun receives(onEditor: Boolean, mounted: Boolean = true, yields: Boolean = false, manipulation: Boolean = false) =
        InlineEditTouchPolicy.canvasReceives(onEditor, mounted, yields, manipulation)

    @Test
    fun `sans edition tout revient au canvas`() {
        assertThat(receives(onEditor = true, mounted = false)).isTrue()
    }

    @Test
    fun `le tap sur le champ atteint le champ`() {
        assertThat(receives(onEditor = true)).isFalse()
        assertThat(receives(onEditor = true, yields = true)).isFalse()
    }

    @Test
    fun `une touche hors du champ revient au canvas`() {
        assertThat(receives(onEditor = false)).isTrue()
    }

    @Test
    fun `un geste de manipulation cede la saisie quand l'hote l'opte`() {
        assertThat(receives(onEditor = true, yields = true, manipulation = true)).isTrue()
    }

    @Test
    fun `un geste de manipulation ne cede rien quand l'hote ne l'opte pas`() {
        assertThat(receives(onEditor = true, yields = false, manipulation = true)).isFalse()
    }

    @Test
    fun `un second doigt ou un glissement au-dela du seuil est une manipulation`() {
        assertThat(InlineEditTouchPolicy.isManipulation(travelPx = 2f, slopPx = 8f, pointerCount = 1)).isFalse()
        assertThat(InlineEditTouchPolicy.isManipulation(travelPx = 20f, slopPx = 8f, pointerCount = 1)).isTrue()
        assertThat(InlineEditTouchPolicy.isManipulation(travelPx = 0f, slopPx = 8f, pointerCount = 2)).isTrue()
    }

    @Test
    fun `le clavier qui se range suspend la saisie de l'hote qui l'opte seulement`() {
        assertThat(InlineEditTouchPolicy.suspendsOnKeyboardClosed(true, true, keyboardWasShown = true, keyboardShown = false)).isTrue()
        assertThat(InlineEditTouchPolicy.suspendsOnKeyboardClosed(false, true, true, false)).isFalse()
        assertThat(InlineEditTouchPolicy.suspendsOnKeyboardClosed(true, true, false, false)).isFalse()
        assertThat(InlineEditTouchPolicy.suspendsOnKeyboardClosed(true, false, true, false)).isFalse()
        assertThat(InlineEditTouchPolicy.suspendsOnKeyboardClosed(true, true, true, true)).isFalse()
    }
}
