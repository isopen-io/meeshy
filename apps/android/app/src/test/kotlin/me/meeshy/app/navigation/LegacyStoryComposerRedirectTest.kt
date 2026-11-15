package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class LegacyStoryComposerRedirectTest {
    private fun target(repost: String? = null, audience: String? = null, edit: String? = null, recompose: String? = null) =
        LegacyStoryComposerRedirect.target(repost, audience, edit, recompose)

    @Test
    fun `a bare legacy entry opens the host on the story tray door`() {
        assertThat(target()).isEqualTo(storyDoor)
        assertThat(target(repost = " ")).isEqualTo(storyDoor)
    }

    @Test
    fun `an entry carrying an intent the host does not serve yet keeps the legacy screen`() {
        assertThat(target(repost = "p1")).isNull()
        assertThat(target(audience = "FRIENDS")).isNull()
        assertThat(target(edit = "s1")).isNull()
        assertThat(target(recompose = "s1")).isNull()
    }

    @Test
    fun `the onboarding recognises the host as a composer too`() {
        assertThat(OnboardingRootRules.isStoryComposer(Routes.COMPOSER)).isTrue()
    }
}
