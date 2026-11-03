package me.meeshy.app.feed

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.assertLeftPositionInRootIsEqualTo
import androidx.compose.ui.test.assertTouchHeightIsEqualTo
import androidx.compose.ui.test.assertTouchWidthIsEqualTo
import androidx.compose.ui.test.click
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.feed.R
import me.meeshy.sdk.media.MediaUploadItem
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/**
 * #14287 — le ✕ d'une pièce en attente est un rond net dans le coin de sa vignette. #14313 — la vignette ne touche pas le
 * bord. #15229 — toucher la vignette, son centre compris, ouvre la retouche ; seul le ✕, à cheval sur le coin, retire.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp-xhdpi")
class CommentAttachmentBarComposeTest {

    @get:Rule
    val compose = createComposeRule()

    private val tray = CommentAttachmentTray().adding("p1", MediaUploadItem(byteArrayOf(1, 2), "voice.m4a", "audio/mp4"))
    private fun string(id: Int) = RuntimeEnvironment.getApplication().getString(id)
    private val removeLabel get() = string(R.string.feed_composer_remove_media)
    private val editLabel get() = string(R.string.post_comments_edit_media)

    private fun clickLabelled(label: String) = SemanticsMatcher("clic « $label »") { it.config.getOrNull(SemanticsActions.OnClick)?.label == label }
    private fun piece(): SemanticsNodeInteraction = compose.onNode(clickLabelled(editLabel))
    private fun removal(): SemanticsNodeInteraction = compose.onNode(clickLabelled(removeLabel))

    private fun show(edited: MutableList<String> = mutableListOf(), removed: MutableList<String> = mutableListOf()) =
        compose.setContent { CommentAttachmentBar(tray = tray, onEdit = { edited += it.id }, onRemove = { removed += it }) }

    @Test
    fun `toucher le centre de la vignette ouvre sa retouche et ne retire rien`() {
        val edited = mutableListOf<String>()
        val removed = mutableListOf<String>()
        show(edited, removed)

        piece().performTouchInput { click(center) }

        assertThat(edited).containsExactly("p1")
        assertThat(removed).isEmpty()
    }

    @Test
    fun `la cible du ✕ fait 48 dp et ne couvre pas le centre de la vignette`() {
        show()

        val tile = piece().fetchSemanticsNode().boundsInRoot
        val target = removal().assertTouchWidthIsEqualTo(48.dp).assertTouchHeightIsEqualTo(48.dp).fetchSemanticsNode().touchBoundsInRoot

        assertThat(target.contains(tile.center)).isFalse()
        assertThat(target.right).isGreaterThan(tile.right)
        assertThat(target.top).isLessThan(tile.top)
    }

    @Test
    fun `le ✕ déborde du coin haut droit de la vignette et retire la pièce`() {
        val edited = mutableListOf<String>()
        val removed = mutableListOf<String>()
        show(edited, removed)

        val tile = piece().fetchSemanticsNode().boundsInRoot
        val badge = removal().fetchSemanticsNode().boundsInRoot
        assertThat(badge.right).isGreaterThan(tile.right)
        assertThat(badge.top).isLessThan(tile.top)

        removal().performClick()

        assertThat(removed).containsExactly("p1")
        assertThat(edited).isEmpty()
    }

    @Test
    fun `toucher hors de la vignette, au-dessus et à droite de son coin, retire la pièce`() {
        val edited = mutableListOf<String>()
        val removed = mutableListOf<String>()
        show(edited, removed)

        val tile = piece().fetchSemanticsNode().boundsInRoot
        val badge = removal().fetchSemanticsNode().boundsInRoot
        val outward = with(compose.density) { Offset(tile.right - badge.left + 12.dp.toPx(), tile.top - badge.top - 12.dp.toPx()) }

        removal().performTouchInput { click(outward) }

        assertThat(removed).containsExactly("p1")
        assertThat(edited).isEmpty()
    }

    @Test
    fun `la cible réelle du ✕ fait au moins 44 dp sans s'appuyer sur l'élargissement de Compose`() {
        show()

        removal().assertWidthIsAtLeast(44.dp).assertHeightIsAtLeast(44.dp)
    }

    @Test
    fun `TalkBack lit deux boutons distincts, éditer la pièce et la retirer`() {
        show()

        val tile = piece().fetchSemanticsNode().config
        val badge = removal().fetchSemanticsNode().config

        assertThat(tile.getOrNull(SemanticsProperties.ContentDescription)).containsExactly(editLabel)
        assertThat(badge.getOrNull(SemanticsProperties.ContentDescription)).containsExactly(removeLabel)
        assertThat(tile.getOrNull(SemanticsProperties.Role)).isEqualTo(Role.Button)
        assertThat(badge.getOrNull(SemanticsProperties.Role)).isEqualTo(Role.Button)
    }

    @Test
    fun `la première vignette est en retrait du bord gauche du composeur, comme la bande des conversations`() {
        show()

        piece().assertLeftPositionInRootIsEqualTo(12.dp)
    }
}
