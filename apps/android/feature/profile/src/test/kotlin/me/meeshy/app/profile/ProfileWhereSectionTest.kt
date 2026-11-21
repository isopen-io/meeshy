package me.meeshy.app.profile

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import me.meeshy.sdk.model.relation.SharedLocationPrecision
import me.meeshy.sdk.model.relation.SharedLocationRoster
import me.meeshy.sdk.model.relation.SharedLocationShareDuration
import me.meeshy.sdk.relation.SharedLocationShareProblem
import me.meeshy.sdk.relation.SharedLocationSharing
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * « Où il est » sur la face Actions (#18888) : PROPOSER un partage exige le cercle (dès Ami), ARRÊTER un partage en cours ne
 * l'exige jamais. Une personne passée sous Ami pendant que je lui montre ma position doit pouvoir être arrêtée depuis sa
 * fiche : sans cela, ma position continue de partir sans geste pour la retenir.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "en-w360dp-h740dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ProfileWhereSectionTest {

    @get:Rule
    val compose = createComposeRule()

    private val person = "aaaaaaaaaaaaaaaaaaaaaaaa"
    private val heading = "Where they are"

    private class FakeSharing(roster: SharedLocationRoster) : SharedLocationSharing {
        override val roster: StateFlow<SharedLocationRoster> = MutableStateFlow(roster)
        override val isBusy: StateFlow<Boolean> = MutableStateFlow(false)
        override fun restore() = Unit
        override suspend fun share(
            userId: String,
            precision: SharedLocationPrecision,
            duration: SharedLocationShareDuration,
        ): SharedLocationShareProblem? = null
        override suspend fun stopSharing(userId: String): SharedLocationShareProblem? = null
    }

    private fun viewModel(sharing: Boolean): ProfileShareLocationViewModel {
        val roster = if (sharing) {
            SharedLocationRoster.EMPTY.adding(person, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR, System.currentTimeMillis())
        } else {
            SharedLocationRoster.EMPTY
        }
        return ProfileShareLocationViewModel(FakeSharing(roster))
    }

    @Test
    fun `a share in progress stays stoppable when the circle no longer opens sharing`() {
        val vm = viewModel(sharing = true)
        compose.setContent { MeeshyTheme { ProfileWhereSection(userId = person, displayName = "Léo", offered = false, viewModel = vm) } }
        compose.onNodeWithText(heading).assertIsDisplayed()
        compose.onNodeWithTag(PROFILE_SHARE_LOCATION_STOP_TAG).assertIsDisplayed()
        compose.onNodeWithTag(PROFILE_SHARE_LOCATION_TAG).assertDoesNotExist()
    }

    @Test
    fun `below Ami with nothing shared the section says nothing, not even its heading`() {
        val vm = viewModel(sharing = false)
        compose.setContent { MeeshyTheme { ProfileWhereSection(userId = person, displayName = "Léo", offered = false, viewModel = vm) } }
        compose.onNodeWithText(heading).assertDoesNotExist()
        compose.onNodeWithTag(PROFILE_SHARE_LOCATION_TAG).assertDoesNotExist()
    }

    @Test
    fun `from Ami the section offers to share`() {
        val vm = viewModel(sharing = false)
        compose.setContent { MeeshyTheme { ProfileWhereSection(userId = person, displayName = "Léo", offered = true, viewModel = vm) } }
        compose.onNodeWithText(heading).assertIsDisplayed()
        compose.onNodeWithTag(PROFILE_SHARE_LOCATION_TAG).assertIsDisplayed()
    }
}
