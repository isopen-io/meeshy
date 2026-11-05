package me.meeshy.app.settings

import androidx.compose.material3.Text
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.settings.SettingsHubCatalog
import me.meeshy.sdk.model.settings.SettingsHubSectionId
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Le réglage qu'une invite désigne est mis en évidence, puis rendu à la normale ; le profil vocal ouvre sa création (#16339). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SettingsInviteFocusComposeTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `la section designee porte la mise en evidence puis la rend`() {
        var settled = false
        compose.mainClock.autoAdvance = false
        compose.setContent {
            MeeshyTheme { SettingsFocusFrame(highlighted = true, tint = Color.Blue, onSettled = { settled = true }) { Text("Profil vocal") } }
        }
        compose.mainClock.advanceTimeBy(500)
        compose.onAllNodesWithTag(SETTINGS_FOCUS_TAG).assertCountEquals(1)
        assertThat(settled).isFalse()
        compose.mainClock.advanceTimeBy(5_000)
        assertThat(settled).isTrue()
    }

    @Test
    fun `une section non designee ne porte aucune mise en evidence`() {
        compose.setContent { MeeshyTheme { SettingsFocusFrame(highlighted = false, tint = Color.Blue) { Text("Compte") } } }
        compose.onAllNodesWithTag(SETTINGS_FOCUS_TAG).assertCountEquals(0)
    }

    @Test
    fun `le profil vocal ouvre la creation du profil`() {
        var opened = 0
        val rows = SettingsHubCatalog.sections().first { it.id == SettingsHubSectionId.VOICE }.rows
        compose.setContent { MeeshyTheme { SettingsVoiceSection(rows) { opened++ } } }
        compose.onNodeWithText("Create a voice profile").performClick()
        assertThat(opened).isEqualTo(1)
    }

    @Test
    fun `le profil vocal ouvre aussi la gestion du profil existant`() {
        var managed = 0
        var created = 0
        val rows = SettingsHubCatalog.sections().first { it.id == SettingsHubSectionId.VOICE }.rows
        compose.setContent { MeeshyTheme { SettingsVoiceSection(rows, onManageVoiceProfile = { managed++ }) { created++ } } }
        compose.onNodeWithText("Manage voice profile").performClick()
        assertThat(managed).isEqualTo(1)
        assertThat(created).isEqualTo(0)
    }
}
