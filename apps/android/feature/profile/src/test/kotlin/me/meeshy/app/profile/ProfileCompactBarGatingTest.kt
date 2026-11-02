package me.meeshy.app.profile

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.requiredWidth
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ProfileCompactBarGatingTest {

    @get:Rule
    val compose = createComposeRule()

    private var taps = 0

    private fun bar(progress: Float) = compose.setContent {
        MeeshyTheme(darkTheme = false) {
            Box(Modifier.requiredWidth(400.dp)) {
                ProfileCompactBar(
                    progress = progress,
                    displayName = "Bob",
                    handle = "@bob",
                    avatarUrl = null,
                    accent = MeeshyPalette.Indigo500,
                    presence = null,
                    moodEmoji = null,
                    onTap = { taps++ },
                    onMoodTap = {},
                )
            }
        }
    }

    @Test
    fun `l'opacite suit la progression, bornee`() {
        assertThat(ProfileCompactBarGating.of(0f).alpha).isEqualTo(0f)
        assertThat(ProfileCompactBarGating.of(0.4f).alpha).isEqualTo(0.4f)
        assertThat(ProfileCompactBarGating.of(1f).alpha).isEqualTo(1f)
        assertThat(ProfileCompactBarGating.of(-2f).alpha).isEqualTo(0f)
        assertThat(ProfileCompactBarGating.of(3f).alpha).isEqualTo(1f)
    }

    @Test
    fun `la barre n'est touchable qu'au-dela de la moitie`() {
        assertThat(ProfileCompactBarGating.of(0.5f).isInteractive).isFalse()
        assertThat(ProfileCompactBarGating.of(0.51f).isInteractive).isTrue()
        assertThat(ProfileCompactBarGating.of(1f).isInteractive).isTrue()
    }

    @Test
    fun `la barre reste muette pour TalkBack jusqu'a la moitie`() {
        assertThat(ProfileCompactBarGating.of(0f).isHiddenFromAccessibility).isTrue()
        assertThat(ProfileCompactBarGating.of(0.5f).isHiddenFromAccessibility).isTrue()
        assertThat(ProfileCompactBarGating.of(0.6f).isHiddenFromAccessibility).isFalse()
    }

    @Test
    fun `en dessous de la moitie la barre ne se lit ni ne se touche`() {
        bar(progress = 0.3f)

        compose.onNodeWithContentDescription("Bob, @bob").assertDoesNotExist()
        compose.onNodeWithText("Bob").assertDoesNotExist()
        assertThat(taps).isEqualTo(0)
    }

    @Test
    fun `au-dela de la moitie la barre se lit d'un bloc et se touche`() {
        bar(progress = 0.8f)

        compose.onNodeWithContentDescription("Bob, @bob").performClick()

        assertThat(taps).isEqualTo(1)
    }
}
