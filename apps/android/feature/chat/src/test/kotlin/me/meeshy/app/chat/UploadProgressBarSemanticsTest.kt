package me.meeshy.app.chat

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.media.UploadBarFile
import me.meeshy.sdk.model.media.UploadBarProgress
import me.meeshy.sdk.model.media.UploadBarStatus
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class UploadProgressBarSemanticsTest {

    @get:Rule
    val compose = createComposeRule()

    private fun string(id: Int) = RuntimeEnvironment.getApplication().getString(id)

    private val progress = UploadBarProgress(
        listOf(
            UploadBarFile("a.jpg", 100, 100, UploadBarStatus.COMPLETED),
            UploadBarFile("b.mp4", 50, 200, UploadBarStatus.UPLOADING),
            UploadBarFile("c.pdf", 0, 100, UploadBarStatus.QUEUED),
        ),
    )

    private fun show(value: UploadBarProgress) = compose.setContent {
        MeeshyTheme(darkTheme = false) { UploadProgressBar(progress = value, accent = Color.Blue) }
    }

    @Test
    fun `la barre est un seul noeud Envoi des fichiers`() {
        show(progress)

        val node = compose.onNodeWithContentDescription(string(R.string.upload_progress_a11y_label))
        node.assertExists()
    }

    @Test
    fun `la valeur dit le pourcentage, les fichiers envoyes sur le total et le fichier en cours`() {
        show(progress)

        val config = compose.onNodeWithContentDescription(string(R.string.upload_progress_a11y_label)).fetchSemanticsNode().config
        assertThat(config[SemanticsProperties.StateDescription]).isEqualTo("37%, 1 of 3 files uploaded, b.mp4")
    }

    @Test
    fun `sans fichier en cours la valeur n'ajoute pas de nom`() {
        show(UploadBarProgress(listOf(UploadBarFile("a.jpg", 10, 10, UploadBarStatus.COMPLETED))))

        val config = compose.onNodeWithContentDescription(string(R.string.upload_progress_a11y_label)).fetchSemanticsNode().config
        assertThat(config[SemanticsProperties.StateDescription]).isEqualTo("100%, 1 of 1 files uploaded")
    }
}
