package me.meeshy.sdk.model.profile

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ProfileFaceTest {
    private fun plan(
        self: Boolean = false,
        blockedByMe: Boolean = false,
        blockedByTarget: Boolean = false,
    ) = ProfileActionPlan.of(self, false, ProfileConnection.None, blockedByMe, blockedByTarget, true)

    @Test
    fun `the faces read Vitrine then Liens then Actions and open on the Vitrine`() {
        assertThat(ProfileFace.entries).containsExactly(ProfileFace.VITRINE, ProfileFace.LIENS, ProfileFace.ACTIONS).inOrder()
        assertThat(ProfileFace.DEFAULT).isEqualTo(ProfileFace.VITRINE)
    }

    @Test
    fun `someone else's resolved profile offers the three faces`() {
        assertThat(ProfileFaceRule.offered(isSelf = false, plan = plan())).containsExactly(*ProfileFace.entries.toTypedArray()).inOrder()
    }

    @Test
    fun `my own profile has no selector`() {
        assertThat(ProfileFaceRule.offered(isSelf = true, plan = plan(self = true))).isEmpty()
    }

    @Test
    fun `a plan not yet resolved has no selector and fails closed`() {
        assertThat(ProfileFaceRule.offered(isSelf = false, plan = null)).isEmpty()
    }

    @Test
    fun `a blocked person and a person who blocked me have no selector`() {
        assertThat(ProfileFaceRule.offered(isSelf = false, plan = plan(blockedByMe = true))).isEmpty()
        assertThat(ProfileFaceRule.offered(isSelf = false, plan = plan(blockedByTarget = true))).isEmpty()
    }

    @Test
    fun `a face that is no longer offered falls back to the Vitrine`() {
        val offered = ProfileFaceRule.offered(isSelf = false, plan = plan())
        assertThat(ProfileFaceRule.shown(ProfileFace.ACTIONS, offered)).isEqualTo(ProfileFace.ACTIONS)
        assertThat(ProfileFaceRule.shown(ProfileFace.ACTIONS, emptyList())).isEqualTo(ProfileFace.VITRINE)
    }

    @Test
    fun `a saved face name restores, an unknown one reads the Vitrine`() {
        assertThat(ProfileFace.restored("LIENS")).isEqualTo(ProfileFace.LIENS)
        assertThat(ProfileFace.restored("ACTIONS")).isEqualTo(ProfileFace.ACTIONS)
        assertThat(ProfileFace.restored("SOMETHING_NEW")).isEqualTo(ProfileFace.VITRINE)
        assertThat(ProfileFace.restored(null)).isEqualTo(ProfileFace.VITRINE)
    }
}
