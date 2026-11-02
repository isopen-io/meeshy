package me.meeshy.app.stories

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.compose.foundation.clickable
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.stories.R
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowToast

/** Au plafond, un geste d'ajout dit son refus au lieu de se taire ou de se griser (iOS `ComposerSceneAddition`, #13535). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SceneCapRefusalTest {
    @get:Rule
    val compose = createComposeRule()

    private fun string(id: Int): String = ApplicationProvider.getApplicationContext<Context>().getString(id)

    private fun tap(canAdd: Boolean, refusal: Int): Int {
        var done = 0
        compose.setContent {
            MeeshyTheme {
                val guarded = rememberGuardedAddition(canAdd, refusal) { done++ }
                Text("door", Modifier.clickable(onClick = guarded))
            }
        }
        compose.onNodeWithText("door").performClick()
        return done
    }

    @Test
    fun `a text door at the cap names the cap and adds nothing`() {
        assertThat(tap(canAdd = false, refusal = R.string.composer_scene_cap_text)).isEqualTo(0)
        assertThat(ShadowToast.getTextOfLatestToast()).isEqualTo(
            string(R.string.composer_scene_cap_text),
        )
    }

    @Test
    fun `each door has its own refusal`() {
        val texts = listOf(
            R.string.composer_scene_cap_text, R.string.composer_scene_cap_sticker,
            R.string.composer_scene_cap_media, R.string.composer_scene_cap_sound,
        ).map { string(it) }
        assertThat(texts.toSet()).hasSize(4)
    }

    @Test
    fun `below the cap the door acts and says nothing`() {
        ShadowToast.reset()
        assertThat(tap(canAdd = true, refusal = R.string.composer_scene_cap_sticker)).isEqualTo(1)
        assertThat(ShadowToast.shownToastCount()).isEqualTo(0)
    }
}
