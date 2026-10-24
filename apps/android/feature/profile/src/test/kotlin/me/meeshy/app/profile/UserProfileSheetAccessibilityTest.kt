package me.meeshy.app.profile

import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.profile.R
import me.meeshy.sdk.model.profile.ProfileSheetUser
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
class UserProfileSheetAccessibilityTest {

    @get:Rule
    val compose = createComposeRule()

    private val context = RuntimeEnvironment.getApplication()
    private val bob = ProfileSheetUser(userId = "64b7f0a1c2d3e4f5a6b7c8d9", username = "bob", displayName = "Bob")
    private val noActions = ProfileActionCallbacks({}, {}, {}, {}, {}, {}, {}, {}, {})

    private fun body(state: UserProfileSheetUiState, onClose: () -> Unit = {}, onRetry: () -> Unit = {}) =
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                UserProfileSheetBody(
                    state = state,
                    actionsState = ProfileActionsState(),
                    environment = ProfileSheetEnvironment(),
                    isExpanded = false,
                    onClose = onClose,
                    onRetry = onRetry,
                    actions = noActions,
                )
            }
        }

    @Test
    fun `le bouton Fermer porte son libelle, son action annoncee et une cible de 48 dp`() {
        var closed = 0
        body(UserProfileSheetUiState(user = bob, isLoadingProfile = true), onClose = { closed++ })

        val close = compose.onNodeWithContentDescription(context.getString(R.string.common_close), useUnmergedTree = false)
        close.assertIsDisplayed()
        compose.onNodeWithTag(PROFILE_SHEET_CLOSE_TAG)
            .assertWidthIsAtLeast(48.dp)
            .assertHeightIsAtLeast(48.dp)
        val label = compose.onNodeWithTag(PROFILE_SHEET_CLOSE_TAG).fetchSemanticsNode().config[SemanticsActions.OnClick].label
        assertThat(label).isEqualTo(context.getString(R.string.profile_close_hint))

        compose.onNodeWithTag(PROFILE_SHEET_CLOSE_TAG).performClick()
        assertThat(closed).isEqualTo(1)
    }

    @Test
    fun `la feuille porte le nom de la personne comme titre de volet`() {
        body(UserProfileSheetUiState(user = bob, isLoadingProfile = true))

        compose.onNode(SemanticsMatcher.expectValue(SemanticsProperties.PaneTitle, "Bob")).assertExists()
    }

    @Test
    fun `cache vide montre le squelette et jamais le message d'echec`() {
        body(UserProfileSheetUiState(user = bob, isLoadingProfile = true))

        compose.onNodeWithTag(PROFILE_SHEET_SKELETON_TAG, useUnmergedTree = true).assertExists()
        compose.onNodeWithText(context.getString(R.string.profile_loadFailed_message)).assertDoesNotExist()
    }

    @Test
    fun `une panne propose Reessayer qui rejoue le chargement`() {
        var retried = 0
        body(UserProfileSheetUiState(user = bob, loadFailed = true), onRetry = { retried++ })

        compose.onNodeWithText(context.getString(R.string.profile_loadFailed_message)).assertIsDisplayed()
        compose.onNodeWithTag(PROFILE_RETRY_TAG).performClick()
        assertThat(retried).isEqualTo(1)
    }

    @Test
    fun `un refus garde le message sans Reessayer`() {
        body(UserProfileSheetUiState(user = bob))

        compose.onNodeWithText(context.getString(R.string.profile_loadFailed_message)).assertIsDisplayed()
        compose.onNodeWithTag(PROFILE_RETRY_TAG).assertDoesNotExist()
    }
}
