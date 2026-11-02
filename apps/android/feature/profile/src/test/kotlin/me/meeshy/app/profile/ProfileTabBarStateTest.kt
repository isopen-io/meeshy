package me.meeshy.app.profile

import androidx.compose.runtime.saveable.SaverScope
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.profile.ProfileTab
import org.junit.Test

class ProfileTabBarStateTest {

    private val scope = object : SaverScope {
        override fun canBeSaved(value: Any): Boolean = true
    }

    private fun saved(state: ProfileTabBarState): String? = with(ProfileTabBarState.Saver) { scope.save(state) }

    @Test
    fun `l'onglet par defaut est Details`() {
        assertThat(ProfileTabBarState().selected).isEqualTo(ProfileTab.DETAILS)
    }

    @Test
    fun `les trois onglets suivent l'ordre iOS`() {
        assertThat(PROFILE_SHEET_TABS).containsExactly(ProfileTab.POSTS, ProfileTab.CONVERSATIONS, ProfileTab.DETAILS).inOrder()
    }

    @Test
    fun `choisir un autre onglet le selectionne et le signale`() {
        val state = ProfileTabBarState()

        val changed = state.select(ProfileTab.POSTS)

        assertThat(changed).isTrue()
        assertThat(state.selected).isEqualTo(ProfileTab.POSTS)
    }

    @Test
    fun `rechoisir l'onglet courant ne change rien`() {
        val state = ProfileTabBarState()

        assertThat(state.select(ProfileTab.DETAILS)).isFalse()
        assertThat(state.selected).isEqualTo(ProfileTab.DETAILS)
    }

    @Test
    fun `l'onglet choisi survit a la recreation`() {
        val state = ProfileTabBarState()
        state.select(ProfileTab.CONVERSATIONS)

        val restored = ProfileTabBarState.Saver.restore(saved(state)!!)

        assertThat(restored?.selected).isEqualTo(ProfileTab.CONVERSATIONS)
    }

    @Test
    fun `un nom inconnu restaure l'onglet par defaut`() {
        assertThat(ProfileTabBarState.Saver.restore("REELS")?.selected).isEqualTo(ProfileTab.DETAILS)
        assertThat(ProfileTabBarState.restored(null)).isEqualTo(ProfileTab.DETAILS)
    }
}
