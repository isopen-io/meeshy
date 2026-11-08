package me.meeshy.app.chat

import androidx.compose.foundation.layout.padding
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.assertTouchHeightIsEqualTo
import androidx.compose.ui.test.assertTouchWidthIsEqualTo
import androidx.compose.ui.test.click
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.composer.PendingAttachment
import me.meeshy.sdk.model.composer.PendingAttachmentPhase
import me.meeshy.sdk.model.composer.PendingAttachmentType
import me.meeshy.sdk.model.composer.TrayEntry
import me.meeshy.sdk.model.composer.TrayEntryKind
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/** #15229 — toucher la tuile, son centre compris, l'édite ; seul le badge à cheval sur le coin la retire. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp-xhdpi")
class ComposerAttachmentTileTouchTest {

    @get:Rule
    val compose = createComposeRule()

    private fun string(id: Int, vararg args: Any) = RuntimeEnvironment.getApplication().getString(id, *args)

    private val photo = PendingAttachment(
        id = "a1",
        type = PendingAttachmentType.IMAGE,
        fileName = "photo.jpg",
        localPath = "/tmp/photo.jpg",
        mimeType = "image/jpeg",
        phase = PendingAttachmentPhase.Ready,
    )
    private val entry = TrayEntry(key = "a1", kind = TrayEntryKind.READY, label = "photo.jpg", item = photo, position = 1, total = 1)

    private fun clickLabelled(label: String) = SemanticsMatcher("clic « $label »") { it.config.getOrNull(SemanticsActions.OnClick)?.label == label }
    private fun tile(): SemanticsNodeInteraction = compose.onNode(clickLabelled(string(R.string.composer_tray_edit)))
    private fun removal(): SemanticsNodeInteraction = compose.onNode(clickLabelled(string(R.string.chat_tray_remove, "photo.jpg")))

    private fun show(edits: MutableList<String> = mutableListOf(), removals: MutableList<String> = mutableListOf()) = compose.setContent {
        MeeshyTheme(darkTheme = false) {
            ComposerAttachmentTile(
                entry = entry,
                accent = Color.Blue,
                onRemove = { removals += "a1" },
                onEdit = { edits += "a1" },
                onPreview = {},
                modifier = Modifier.padding(24.dp),
            )
        }
    }

    @Test
    fun `toucher le centre de la tuile l'edite et ne la retire pas`() {
        val edits = mutableListOf<String>()
        val removals = mutableListOf<String>()
        show(edits, removals)

        tile().performTouchInput { click(center) }

        assertThat(edits).containsExactly("a1")
        assertThat(removals).isEmpty()
    }

    @Test
    fun `la cible du badge fait 48 dp, deborde du coin et ne couvre pas le centre de la tuile`() {
        show()

        val face = tile().fetchSemanticsNode().boundsInRoot
        val target = removal().assertTouchWidthIsEqualTo(48.dp).assertTouchHeightIsEqualTo(48.dp).fetchSemanticsNode().touchBoundsInRoot

        assertThat(target.contains(face.center)).isFalse()
        assertThat(target.right).isGreaterThan(face.right)
        assertThat(target.top).isLessThan(face.top)
    }

    @Test
    fun `toucher le badge retire la piece`() {
        val edits = mutableListOf<String>()
        val removals = mutableListOf<String>()
        show(edits, removals)

        removal().performClick()

        assertThat(removals).containsExactly("a1")
        assertThat(edits).isEmpty()
    }
}
