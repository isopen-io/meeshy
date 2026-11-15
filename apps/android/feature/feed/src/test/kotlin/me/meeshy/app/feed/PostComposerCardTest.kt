package me.meeshy.app.feed

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.feed.R
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** La carte « Partager quelque chose » du Flux ouvre le composeur complet. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PostComposerCardTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `toucher la carte ouvre le composeur`() {
        var opened = 0
        compose.setContent { MeeshyTheme { FeedComposerPlaceholder(onClick = { opened++ }, userName = "Ada") } }
        val label = ApplicationProvider.getApplicationContext<android.content.Context>().getString(R.string.feed_composer_open_label)

        compose.onNodeWithContentDescription(label).performClick()

        assertThat(opened).isEqualTo(1)
    }
}
