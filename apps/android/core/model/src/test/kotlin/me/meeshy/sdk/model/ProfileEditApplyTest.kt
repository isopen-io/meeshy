package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behaviour of the optimistic profile edit-merge (`PATCH /users/me` omit-null
 * parity): a non-null request field overwrites, a `null` field leaves the user's
 * existing value untouched, and every unrelated identity field survives intact.
 */
class ProfileEditApplyTest {

    private fun user() = MeeshyUser(
        id = "u1",
        username = "alice",
        displayName = "Alice",
        bio = "old bio",
        avatar = "https://cdn/a.png",
        systemLanguage = "fr",
        regionalLanguage = "en",
        customDestinationLanguage = "es",
        firstName = "Al",
        lastName = "Ice",
    )

    @Test
    fun `a present field overwrites the existing value`() {
        val result = ProfileEditApply.apply(user(), UpdateProfileRequest(displayName = "Alicia"))

        assertThat(result.displayName).isEqualTo("Alicia")
    }

    @Test
    fun `an absent field leaves the existing value untouched`() {
        val result = ProfileEditApply.apply(user(), UpdateProfileRequest(bio = "new bio"))

        // displayName was null in the request → unchanged
        assertThat(result.displayName).isEqualTo("Alice")
        assertThat(result.bio).isEqualTo("new bio")
    }

    @Test
    fun `an empty request is an identity merge`() {
        val original = user()

        val result = ProfileEditApply.apply(original, UpdateProfileRequest())

        assertThat(result).isEqualTo(original)
    }

    @Test
    fun `all three content languages overwrite when present`() {
        val result = ProfileEditApply.apply(
            user(),
            UpdateProfileRequest(
                systemLanguage = "de",
                regionalLanguage = "it",
                customDestinationLanguage = "pt",
            ),
        )

        assertThat(result.systemLanguage).isEqualTo("de")
        assertThat(result.regionalLanguage).isEqualTo("it")
        assertThat(result.customDestinationLanguage).isEqualTo("pt")
    }

    @Test
    fun `first and last name overwrite when present`() {
        val result = ProfileEditApply.apply(
            user(),
            UpdateProfileRequest(firstName = "Alicia", lastName = "Keys"),
        )

        assertThat(result.firstName).isEqualTo("Alicia")
        assertThat(result.lastName).isEqualTo("Keys")
    }

    @Test
    fun `unrelated identity fields are preserved through the merge`() {
        val result = ProfileEditApply.apply(user(), UpdateProfileRequest(displayName = "Alicia"))

        assertThat(result.id).isEqualTo("u1")
        assertThat(result.username).isEqualTo("alice")
        assertThat(result.avatar).isEqualTo("https://cdn/a.png")
    }

    @Test
    fun `a field present in the request overwrites even when the user's value was null`() {
        val blank = MeeshyUser(id = "u1", username = "alice")

        val result = ProfileEditApply.apply(blank, UpdateProfileRequest(bio = "first bio"))

        assertThat(result.bio).isEqualTo("first bio")
    }
}
