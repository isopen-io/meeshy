package me.meeshy.app.chat

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.composer.PendingAttachmentType
import me.meeshy.sdk.model.media.PreparationStage
import me.meeshy.sdk.model.media.PreparingAttachment
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AttachmentLoadingTileSemanticsTest {

    @get:Rule
    val compose = createComposeRule()

    private fun string(id: Int) = RuntimeEnvironment.getApplication().getString(id)

    private fun show(stage: PreparationStage, onCancel: () -> Unit = {}) = compose.setContent {
        MeeshyTheme(darkTheme = false) {
            AttachmentLoadingTile(
                item = PreparingAttachment("a", PendingAttachmentType.IMAGE, stage),
                accent = Color.Blue, onCancel = onCancel, onRetry = {}, onHaptic = {},
            )
        }
    }

    @Test
    fun `la tuile est un seul noeud dont le libelle est le type et la valeur l'etape`() {
        show(PreparationStage.Compressing)
        val node = compose.onNodeWithContentDescription(string(R.string.composer_tray_type_image))
        val config = node.fetchSemanticsNode().config
        assertThat(config[SemanticsProperties.StateDescription]).isEqualTo(string(R.string.attachment_stage_compressing))
        assertThat(compose.onAllNodesWithContentDescription(string(R.string.composer_tray_type_image)).fetchSemanticsNodes()).hasSize(1)
    }

    @Test
    fun `l'action personnalisee Annuler appelle l'annulation`() {
        var cancelled = false
        show(PreparationStage.Loading) { cancelled = true }
        val node = compose.onNodeWithContentDescription(string(R.string.composer_tray_type_image)).fetchSemanticsNode()
        val action = node.config[SemanticsActions.CustomActions].single()
        assertThat(action.label).isEqualTo(string(R.string.attachment_loading_cancel_a11y))
        action.action()
        assertThat(cancelled).isTrue()
    }

    @Test
    fun `un echec dit l'echec et son message dans la valeur`() {
        show(PreparationStage.Failed("Image illisible"))
        val config = compose.onNodeWithContentDescription(string(R.string.composer_tray_type_image)).fetchSemanticsNode().config
        assertThat(config[SemanticsProperties.StateDescription]).contains("Image illisible")
    }
}
