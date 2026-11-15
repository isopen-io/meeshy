package me.meeshy.app.feed

import androidx.compose.foundation.layout.Box
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.assertIsDisplayed
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.feed.FeedOverlayAppearance
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Les deux halos du Flux : 6-10 % d'opacité, immobiles sous « Réduire les animations ». */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FeedAmbientHalosTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `les halos restent entre 6 et 10 pour cent dans les deux themes`() {
        listOf(true, false).forEach { dark ->
            FeedOverlayAppearance.halos(dark).forEach { assertThat(it.alpha).isIn(com.google.common.collect.Range.closed(0.06f, 0.10f)) }
        }
    }

    @Test
    fun `sous reduire les animations les halos se composent sans derive`() {
        compose.setContent { MeeshyTheme { Box { FeedAmbientHalos(isDark = true, reduceMotion = true) } } }
        compose.waitForIdle()
        compose.onRoot().assertIsDisplayed()
        assertThat(FeedOverlayAppearance.drift(0, 1f, reduceMotion = true)).isEqualTo(0f to 0f)
    }
}
