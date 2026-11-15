package me.meeshy.app.profile

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * MA page ne montre son squelette que si AUCUNE identité n'est en mémoire : une identité en cache se peint
 * tout de suite (cache-first), avec ses sections — jamais un squelette au-dessus de données affichables.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class OwnProfileBodyTest {

    @get:Rule
    val compose = createComposeRule()

    private val ada = MeeshyUser(
        id = "u1",
        username = "ada",
        email = "ada@meeshy.me",
        emailVerifiedAt = "2026-02-01T00:00:00Z",
        systemLanguage = "fr",
    )

    private fun show(
        state: OwnProfileUiState,
        onOpenFriendRequests: () -> Unit = {},
    ) {
        compose.setContent {
            MeeshyTheme {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    OwnProfileBody(
                        state = state,
                        uploading = null,
                        destinations = OwnProfileDestinations(
                            onOpenStats = null,
                            onOpenProgression = null,
                            onOpenDecor = null,
                            onOpenFriendRequests = onOpenFriendRequests,
                            onViewPosts = {},
                        ),
                        onPickBanner = {},
                        onPickAvatar = {},
                        onOpenImage = {},
                        onMoodTap = null,
                        onPickLanguage = {},
                        onEvent = {},
                        banner = {},
                    )
                }
            }
        }
    }

    @Test
    fun `no skeleton when a user is in memory`() {
        show(OwnProfileUiState(user = ada, systemLanguage = "fr"))

        compose.onNodeWithTag(OWN_PROFILE_SKELETON_TAG).assertDoesNotExist()
        assertThat(compose.onAllNodesWithText("@ada").fetchSemanticsNodes()).isNotEmpty()
    }

    @Test
    fun `the skeleton shows only while no user is in memory`() {
        show(OwnProfileUiState(user = null))

        compose.onNodeWithTag(OWN_PROFILE_SKELETON_TAG).assertExists()
        assertThat(compose.onAllNodesWithText("@ada").fetchSemanticsNodes()).isEmpty()
    }

    @Test
    fun `a verified email carries its badge and the friend requests row opens the requests`() {
        var opened = 0
        show(OwnProfileUiState(user = ada, systemLanguage = "fr", pendingFriendRequests = 3)) { opened++ }

        compose.onNodeWithText("Verified", useUnmergedTree = true).assertExists()
        compose.onNodeWithText("Friend requests", useUnmergedTree = true).performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Friend requests").performClick()

        assertThat(opened).isEqualTo(1)
    }
}
