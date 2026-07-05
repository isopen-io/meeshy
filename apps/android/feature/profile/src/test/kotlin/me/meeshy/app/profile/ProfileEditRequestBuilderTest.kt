package me.meeshy.app.profile

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behaviour of the profile-edit request assembly: trim the buffers, degrade a
 * blank field to `null` (a server-side no-op, never an accidental clear), and
 * carry a genuine edit through verbatim.
 */
class ProfileEditRequestBuilderTest {

    @Test
    fun `trims surrounding whitespace on text fields`() {
        val request = ProfileEditRequestBuilder.build(
            displayName = "  Alice  ",
            bio = "  hi there  ",
            systemLanguage = "fr",
            regionalLanguage = null,
            customDestinationLanguage = null,
        )

        assertThat(request.displayName).isEqualTo("Alice")
        assertThat(request.bio).isEqualTo("hi there")
    }

    @Test
    fun `a blank display name degrades to null so the gateway leaves it unchanged`() {
        val request = ProfileEditRequestBuilder.build(
            displayName = "   ",
            bio = "keep",
            systemLanguage = null,
            regionalLanguage = null,
            customDestinationLanguage = null,
        )

        assertThat(request.displayName).isNull()
        assertThat(request.bio).isEqualTo("keep")
    }

    @Test
    fun `an empty bio degrades to null`() {
        val request = ProfileEditRequestBuilder.build(
            displayName = "Alice",
            bio = "",
            systemLanguage = null,
            regionalLanguage = null,
            customDestinationLanguage = null,
        )

        assertThat(request.bio).isNull()
    }

    @Test
    fun `a null language code stays null`() {
        val request = ProfileEditRequestBuilder.build(
            displayName = "Alice",
            bio = "bio",
            systemLanguage = null,
            regionalLanguage = null,
            customDestinationLanguage = null,
        )

        assertThat(request.systemLanguage).isNull()
        assertThat(request.regionalLanguage).isNull()
        assertThat(request.customDestinationLanguage).isNull()
    }

    @Test
    fun `a blank language code degrades to null`() {
        val request = ProfileEditRequestBuilder.build(
            displayName = "Alice",
            bio = "bio",
            systemLanguage = "  ",
            regionalLanguage = "",
            customDestinationLanguage = "\t",
        )

        assertThat(request.systemLanguage).isNull()
        assertThat(request.regionalLanguage).isNull()
        assertThat(request.customDestinationLanguage).isNull()
    }

    @Test
    fun `carries all three selected language codes through trimmed`() {
        val request = ProfileEditRequestBuilder.build(
            displayName = "Alice",
            bio = "bio",
            systemLanguage = " fr ",
            regionalLanguage = "en",
            customDestinationLanguage = "es",
        )

        assertThat(request.systemLanguage).isEqualTo("fr")
        assertThat(request.regionalLanguage).isEqualTo("en")
        assertThat(request.customDestinationLanguage).isEqualTo("es")
    }
}
