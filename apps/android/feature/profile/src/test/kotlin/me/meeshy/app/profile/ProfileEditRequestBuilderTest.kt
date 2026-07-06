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
            firstName = "  Alice  ",
            lastName = "  Liddell  ",
            displayName = "  Alice  ",
            bio = "  hi there  ",
            systemLanguage = "fr",
            regionalLanguage = null,
            customDestinationLanguage = null,
        )

        assertThat(request.firstName).isEqualTo("Alice")
        assertThat(request.lastName).isEqualTo("Liddell")
        assertThat(request.displayName).isEqualTo("Alice")
        assertThat(request.bio).isEqualTo("hi there")
    }

    @Test
    fun `a blank display name degrades to null so the gateway leaves it unchanged`() {
        val request = ProfileEditRequestBuilder.build(
            firstName = "Alice",
            lastName = "Liddell",
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
    fun `a blank first name degrades to null so the gateway leaves it unchanged`() {
        val request = ProfileEditRequestBuilder.build(
            firstName = "   ",
            lastName = "Liddell",
            displayName = "Alice",
            bio = "bio",
            systemLanguage = null,
            regionalLanguage = null,
            customDestinationLanguage = null,
        )

        assertThat(request.firstName).isNull()
        assertThat(request.lastName).isEqualTo("Liddell")
    }

    @Test
    fun `a blank last name degrades to null`() {
        val request = ProfileEditRequestBuilder.build(
            firstName = "Alice",
            lastName = "",
            displayName = "Alice",
            bio = "bio",
            systemLanguage = null,
            regionalLanguage = null,
            customDestinationLanguage = null,
        )

        assertThat(request.firstName).isEqualTo("Alice")
        assertThat(request.lastName).isNull()
    }

    @Test
    fun `an empty bio degrades to null`() {
        val request = ProfileEditRequestBuilder.build(
            firstName = "Alice",
            lastName = "Liddell",
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
            firstName = "Alice",
            lastName = "Liddell",
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
            firstName = "Alice",
            lastName = "Liddell",
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
            firstName = "Alice",
            lastName = "Liddell",
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

    @Test
    fun `carries genuine first and last name edits through`() {
        val request = ProfileEditRequestBuilder.build(
            firstName = "Alicia",
            lastName = "Keys",
            displayName = "Alice",
            bio = "bio",
            systemLanguage = null,
            regionalLanguage = null,
            customDestinationLanguage = null,
        )

        assertThat(request.firstName).isEqualTo("Alicia")
        assertThat(request.lastName).isEqualTo("Keys")
    }
}
