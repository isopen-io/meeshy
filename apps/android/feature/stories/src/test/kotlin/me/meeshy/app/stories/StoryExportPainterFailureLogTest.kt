package me.meeshy.app.stories

import android.util.Log
import androidx.compose.ui.test.junit4.createComposeRule
import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.sdk.media.scene.SceneExportLog
import me.meeshy.sdk.model.scene.export.StoryExportOverlayFrame
import me.meeshy.sdk.model.scene.export.StoryExportVideoFormat
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowLog

/**
 * #13986 — sur le S8, « ⋯ › Enregistrer » échouait en deux secondes et le logcat n'en gardait AUCUNE ligne : le peintre des
 * calques avalait son exception (`catch … { null }`), le coordinateur aussi. Un calque qui ne s'écrit pas rend toujours
 * `null` — l'export s'arrête —, mais sa cause part au journal, sous l'étiquette de l'export.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp-xhdpi")
class StoryExportPainterFailureLogTest {

    @get:Rule val compose = createComposeRule()

    @get:Rule val folder = TemporaryFolder()

    private fun request(directory: File) = StoryExportPaintRequest(
        slide = StorySlideView(id = "s", text = "", isTranslated = false, imageUrl = null, accentHex = "112233"),
        effects = null,
        durationMillis = 1_000,
        frames = listOf(StoryExportOverlayFrame(0, 1_000)),
        withBackground = false,
        directory = directory,
        format = StoryExportVideoFormat.of(),
    )

    @Test
    fun `a layer that cannot be written stops the export and journalizes its cause`() {
        ShadowLog.clear()
        val notADirectory = folder.newFile("calques")
        var answered = false
        var painted: List<File>? = emptyList()
        compose.setContent {
            StoryExportPainter(request(notADirectory)) { files ->
                painted = files
                answered = true
            }
        }

        compose.waitUntil(timeoutMillis = 10_000) { answered }

        assertThat(painted).isNull()
        val logged = ShadowLog.getLogsForTag(SceneExportLog.TAG)
        assertThat(logged).isNotEmpty()
        assertThat(logged.first().type).isEqualTo(Log.WARN)
        assertThat(logged.first().throwable).isNotNull()
        assertThat(logged.first().msg).contains("calques non peints")
    }
}
