package me.meeshy.app.profile

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.requiredWidth
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.profile.R
import me.meeshy.sdk.model.profile.ProfileTab
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ProfileTabBarAccessibilityTest {

    @get:Rule
    val compose = createComposeRule()

    private val context = RuntimeEnvironment.getApplication()
    private val posts = context.getString(R.string.profile_tab_posts)
    private val conversations = context.getString(R.string.profile_tab_conversations)
    private val details = context.getString(R.string.profile_tab_details)
    private val selections = mutableListOf<ProfileTab>()

    private fun tabBar() = compose.setContent {
        MeeshyTheme(darkTheme = false) {
            Box(Modifier.requiredWidth(420.dp)) {
                var selected by remember { mutableStateOf(ProfileTab.DEFAULT) }
                ProfileTabBar(
                    selected = selected,
                    accent = MeeshyPalette.Indigo500,
                    onSelect = {
                        selections += it
                        selected = it
                    },
                )
            }
        }
    }

    @Test
    fun `les trois onglets sont des onglets et Details est selectionne par defaut`() {
        tabBar()

        val isTab = SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Tab)
        compose.onNodeWithText(details).assert(isTab).assertIsSelected()
        compose.onNodeWithText(posts).assert(isTab).assertIsNotSelected()
        compose.onNodeWithText(conversations).assert(isTab).assertIsNotSelected()
    }

    @Test
    fun `toucher un onglet annonce sa selection`() {
        tabBar()

        compose.onNodeWithText(posts).performClick()

        compose.onNodeWithText(posts).assertIsSelected()
        compose.onNodeWithText(details).assertIsNotSelected()
        assertThat(selections).containsExactly(ProfileTab.POSTS)
    }

    @Test
    fun `chaque onglet offre une cible de 48 dp`() {
        tabBar()

        listOf(posts, conversations, details).forEach { title ->
            compose.onNodeWithText(title).assertHeightIsAtLeast(48.dp)
        }
    }
}
