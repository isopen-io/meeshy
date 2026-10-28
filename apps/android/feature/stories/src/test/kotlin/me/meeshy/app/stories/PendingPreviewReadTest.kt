package me.meeshy.app.stories

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.junit4.createComposeRule
import com.google.common.truth.Truth.assertThat
import java.io.ByteArrayInputStream
import java.io.InputStream
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadSource
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #13553 — la vignette d'un média en attente ne RELIT pas son média à chaque recomposition : l'aperçu se calcule une
 * fois par `cmid`, et un média adossé à un fichier n'est jamais lu du tout (Coil reçoit le fichier).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PendingPreviewReadTest {

    @get:Rule
    val compose = createComposeRule()

    private class CountingSource : MediaUploadSource {
        var opens = 0
        override val size: Long = 4L
        override fun open(offset: Long): InputStream {
            opens++
            return ByteArrayInputStream(ByteArray(4).copyOfRange(offset.toInt(), 4))
        }
    }

    @Test
    fun `a pending tile reads its media once, however often the row recomposes`() {
        val source = CountingSource()
        val pending = listOf(PendingMediaUpload("cmid-1", MediaUploadItem(source = source, fileName = "a.png", mimeType = "image/png")))
        var tick by mutableIntStateOf(0)
        compose.setContent {
            MeeshyTheme {
                MediaPreviewRow(
                    attachments = emptyList(),
                    pending = pending,
                    backgroundMediaId = "bg-$tick",
                    backgroundIsVideo = false,
                    backgroundLoop = tick % 2 == 0,
                    onRemove = { tick },
                    onToggleBackground = {},
                    onToggleBackgroundLoop = {},
                )
            }
        }
        compose.waitForIdle()
        val afterFirstFrame = source.opens

        repeat(6) {
            tick++
            compose.waitForIdle()
        }

        assertThat(afterFirstFrame).isAtMost(1)
        assertThat(source.opens).isEqualTo(afterFirstFrame)
    }
}
