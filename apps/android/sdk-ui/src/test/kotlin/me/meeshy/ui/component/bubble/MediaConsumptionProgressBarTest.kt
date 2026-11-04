package me.meeshy.ui.component.bubble

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.assertIsDisplayed
import me.meeshy.sdk.model.MeeshyMediaConsumption
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class MediaConsumptionProgressBarTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `sous 1 pour cent la barre n'existe pas`() {
        compose.setContent { MediaConsumptionProgressBar(accent = Color.Red, localFraction = 0.005) }
        compose.onNodeWithTag(MEDIA_CONSUMPTION_BAR_TAG, useUnmergedTree = true).assertDoesNotExist()
    }

    @Test
    fun `une fraction locale dessine la barre`() {
        compose.setContent { MediaConsumptionProgressBar(accent = Color.Red, localFraction = 0.5) }
        compose.onNodeWithTag(MEDIA_CONSUMPTION_BAR_TAG, useUnmergedTree = true).assertIsDisplayed()
    }

    @Test
    fun `sans valeur locale la consommation servie la dessine`() {
        val served = MeeshyMediaConsumption(lastWatchPositionMs = 30_000)
        compose.setContent { MediaConsumptionProgressBar(accent = Color.Red, served = served, totalDurationSeconds = 60.0) }
        compose.onNodeWithTag(MEDIA_CONSUMPTION_BAR_TAG, useUnmergedTree = true).assertIsDisplayed()
    }

    @Test
    fun `une valeur locale nulle l'emporte sur le servi`() {
        val served = MeeshyMediaConsumption(lastWatchPositionMs = 30_000)
        compose.setContent { MediaConsumptionProgressBar(accent = Color.Red, localFraction = 0.0, served = served, totalDurationSeconds = 60.0) }
        compose.onNodeWithTag(MEDIA_CONSUMPTION_BAR_TAG, useUnmergedTree = true).assertDoesNotExist()
    }
}
