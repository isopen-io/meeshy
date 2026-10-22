package me.meeshy.sdk.model.profile

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ProfileSheetUserTest {
    @Test
    fun `id prefers userId then participantId then username`() {
        assertThat(ProfileSheetUser(userId = "u", participantId = "p", username = "n").id).isEqualTo("u")
        assertThat(ProfileSheetUser(participantId = "p", username = "n").id).isEqualTo("p")
        assertThat(ProfileSheetUser(username = "n").id).isEqualTo("n")
    }

    @Test
    fun `from recognises lower and upper case object ids as userId`() {
        val lower = "507f1f77bcf86cd799439011"
        assertThat(ProfileSheetUser.from(lower).userId).isEqualTo(lower)
        assertThat(ProfileSheetUser.from(lower.uppercase()).userId).isEqualTo(lower.uppercase())
    }

    @Test
    fun `from treats anything else as a username`() {
        assertThat(ProfileSheetUser.from("alice").userId).isNull()
        assertThat(ProfileSheetUser.from("alice").username).isEqualTo("alice")
        assertThat(ProfileSheetUser.from("507f1f77bcf86cd79943901").userId).isNull()
        assertThat(ProfileSheetUser.from("507f1f77bcf86cd79943901z").userId).isNull()
    }

    @Test
    fun `display name falls back to username`() {
        assertThat(ProfileSheetUser(username = "n").resolvedDisplayName).isEqualTo("n")
        assertThat(ProfileSheetUser(username = "n", displayName = "N N").resolvedDisplayName).isEqualTo("N N")
    }

    @Test
    fun `self rule matches id or username and ignores empty session`() {
        assertThat(ProfileSelfRule.isSelf("me", "bob", "me", "x")).isTrue()
        assertThat(ProfileSelfRule.isSelf("me", "bob", null, "bob")).isTrue()
        assertThat(ProfileSelfRule.isSelf("me", "bob", "other", "x")).isFalse()
        assertThat(ProfileSelfRule.isSelf("", "bob", "", "bob")).isFalse()
        assertThat(ProfileSelfRule.isSelf(null, "bob", null, "bob")).isFalse()
    }
}
