package me.meeshy.app.profile

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UpdateProfileRequest
import org.junit.Test

/**
 * The editor's save request is computed against the ORIGINAL snapshot: trimmed, an untouched field
 * omitted, an emptied bio sent as a real clear, an emptied name never sent.
 */
class ProfileEditRequestBuilderTest {

    private val original = MeeshyUser(
        id = "u1",
        username = "alice",
        firstName = "Alice",
        lastName = "Liddell",
        displayName = "Alice",
        bio = "hi there",
        systemLanguage = "fr",
        regionalLanguage = "en",
        customDestinationLanguage = "es",
    )

    private fun build(
        firstName: String = "Alice",
        lastName: String = "Liddell",
        displayName: String = "Alice",
        bio: String = "hi there",
        systemLanguage: String = "fr",
        regionalLanguage: String = "en",
        customDestinationLanguage: String = "es",
        from: MeeshyUser? = original,
    ) = ProfileEditRequestBuilder.build(
        original = from,
        firstName = firstName,
        lastName = lastName,
        displayName = displayName,
        bio = bio,
        systemLanguage = systemLanguage,
        regionalLanguage = regionalLanguage,
        customDestinationLanguage = customDestinationLanguage,
    )

    @Test
    fun `buffers equal to the original snapshot send nothing`() {
        assertThat(build()).isEqualTo(UpdateProfileRequest())
    }

    @Test
    fun `a genuine edit is trimmed and sent alone`() {
        val request = build(firstName = "  Alicia  ", lastName = " Keys ")

        assertThat(request).isEqualTo(UpdateProfileRequest(firstName = "Alicia", lastName = "Keys"))
    }

    @Test
    fun `emptying the bio sends an empty string so the gateway clears it`() {
        assertThat(build(bio = "   ").bio).isEqualTo("")
    }

    @Test
    fun `an emptied first name, last name or display name stays omitted`() {
        val request = build(firstName = "", lastName = "  ", displayName = "")

        assertThat(request).isEqualTo(UpdateProfileRequest())
    }

    @Test
    fun `clearing a secondary language sends an empty string, changing the primary sends its code`() {
        val request = build(systemLanguage = "de", regionalLanguage = "", customDestinationLanguage = "")

        assertThat(request).isEqualTo(
            UpdateProfileRequest(systemLanguage = "de", regionalLanguage = "", customDestinationLanguage = ""),
        )
    }

    @Test
    fun `an already empty bio left empty is never a clear of nothing`() {
        val request = build(bio = "", from = original.copy(bio = null))

        assertThat(request.bio).isNull()
    }
}
