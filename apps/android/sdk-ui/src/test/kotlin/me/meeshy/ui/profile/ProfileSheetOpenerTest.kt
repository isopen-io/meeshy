package me.meeshy.ui.profile

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.createComposeRule
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.profile.ProfileSheetUser
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ProfileSheetOpenerTest {

    @get:Rule
    val compose = createComposeRule()

    private val bob = ProfileSheetUser(userId = "64b7f0a1c2d3e4f5a6b7c8d9", username = "bob")

    @Test
    fun `sans hote l'ouvreur par defaut est inerte et ne plante pas`() {
        var resolved: ProfileSheetOpener? = null
        compose.setContent { resolved = LocalProfileSheetOpener.current }
        compose.waitForIdle()

        assertThat(resolved).isSameInstanceAs(InertProfileSheetOpener)
        resolved?.open(bob)
    }

    @Test
    fun `l'hote fournit l'ouvreur que toute surface appelle`() {
        val opened = mutableListOf<ProfileSheetUser>()
        val host = ProfileSheetOpener { opened += it }
        compose.setContent {
            CompositionLocalProvider(LocalProfileSheetOpener provides host) {
                LocalProfileSheetOpener.current.open(bob)
            }
        }
        compose.waitForIdle()

        assertThat(opened).containsExactly(bob)
    }
}
