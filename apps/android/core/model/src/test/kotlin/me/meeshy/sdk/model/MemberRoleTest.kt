package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MemberRoleTest {

    @Test
    fun `from decodes a known role case-insensitively`() {
        assertThat(MemberRole.from("admin")).isEqualTo(MemberRole.ADMIN)
        assertThat(MemberRole.from("CREATOR")).isEqualTo(MemberRole.CREATOR)
        assertThat(MemberRole.from("Moderator")).isEqualTo(MemberRole.MODERATOR)
    }

    @Test
    fun `from falls back to member for an unknown or absent role`() {
        assertThat(MemberRole.from("owner")).isEqualTo(MemberRole.MEMBER)
        assertThat(MemberRole.from(null)).isEqualTo(MemberRole.MEMBER)
        assertThat(MemberRole.from("")).isEqualTo(MemberRole.MEMBER)
    }

    @Test
    fun `wireValue round-trips through from for every role`() {
        MemberRole.entries.forEach { role ->
            assertThat(MemberRole.from(role.wireValue)).isEqualTo(role)
        }
    }

    @Test
    fun `wireValue is the lowercase gateway token`() {
        assertThat(MemberRole.CREATOR.wireValue).isEqualTo("creator")
        assertThat(MemberRole.MEMBER.wireValue).isEqualTo("member")
    }

    @Test
    fun `hasMinimumRole compares by rank`() {
        assertThat(MemberRole.ADMIN.hasMinimumRole(MemberRole.MODERATOR)).isTrue()
        assertThat(MemberRole.MEMBER.hasMinimumRole(MemberRole.MODERATOR)).isFalse()
        assertThat(MemberRole.MODERATOR.hasMinimumRole(MemberRole.MODERATOR)).isTrue()
    }
}
