package me.meeshy.sdk.model.profile

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UpdateProfileRequest
import org.junit.Test

/**
 * « Seuls les champs modifiés partent » : la table champ non touché / modifié / vidé / déjà vide,
 * comparée au cliché d'origine (iOS `ProfileView.changedOrNil`).
 */
class ProfileEditDiffTest {

    private fun original(
        bio: String? = "hi",
        regionalLanguage: String? = "en",
        customDestinationLanguage: String? = "es",
    ) = MeeshyUser(
        id = "u1",
        username = "alice",
        firstName = "Alice",
        lastName = "Liddell",
        displayName = "Alice L.",
        bio = bio,
        systemLanguage = "fr",
        regionalLanguage = regionalLanguage,
        customDestinationLanguage = customDestinationLanguage,
    )

    private fun untouched(user: MeeshyUser) = ProfileEditBuffers(
        firstName = user.firstName.orEmpty(),
        lastName = user.lastName.orEmpty(),
        displayName = user.displayName.orEmpty(),
        bio = user.bio.orEmpty(),
        systemLanguage = user.systemLanguage.orEmpty(),
        regionalLanguage = user.regionalLanguage.orEmpty(),
        customDestinationLanguage = user.customDestinationLanguage.orEmpty(),
    )

    @Test
    fun `an untouched editor sends nothing at all`() {
        val user = original()

        val request = ProfileEditDiff.request(user, untouched(user))

        assertThat(request).isEqualTo(UpdateProfileRequest())
        assertThat(ProfileEditDiff.isEmpty(request)).isTrue()
    }

    @Test
    fun `a modified field is sent alone, trimmed`() {
        val user = original()

        val request = ProfileEditDiff.request(user, untouched(user).copy(displayName = "  Alicia  "))

        assertThat(request).isEqualTo(UpdateProfileRequest(displayName = "Alicia"))
    }

    @Test
    fun `clearing the bio and both secondary languages sends empty strings`() {
        val user = original()

        val request = ProfileEditDiff.request(
            user,
            untouched(user).copy(bio = "   ", regionalLanguage = "", customDestinationLanguage = ""),
        )

        assertThat(request).isEqualTo(
            UpdateProfileRequest(bio = "", regionalLanguage = "", customDestinationLanguage = ""),
        )
    }

    @Test
    fun `an already empty clearable field stays omitted - never a clear of nothing`() {
        val user = original(bio = null, regionalLanguage = null, customDestinationLanguage = "")

        val request = ProfileEditDiff.request(user, untouched(user))

        assertThat(request.bio).isNull()
        assertThat(request.regionalLanguage).isNull()
        assertThat(request.customDestinationLanguage).isNull()
    }

    @Test
    fun `an emptied first name, last name, display name or primary language stays omitted`() {
        val user = original()

        val request = ProfileEditDiff.request(
            user,
            untouched(user).copy(firstName = "", lastName = "  ", displayName = "", systemLanguage = ""),
        )

        assertThat(request).isEqualTo(UpdateProfileRequest())
    }

    @Test
    fun `a first name, last name or display name of one character is refused, two pass, trimmed`() {
        // #13825 : « A » n'est pas un nom ; « Al », « Li », « Sy » le sont.
        val user = original()

        assertThat(ProfileEditDiff.tooShortNames(user, untouched(user).copy(firstName = "A")))
            .containsExactly(ProfileNameField.FIRST_NAME)
        assertThat(ProfileEditDiff.tooShortNames(user, untouched(user).copy(lastName = "  B ")))
            .containsExactly(ProfileNameField.LAST_NAME)
        assertThat(ProfileEditDiff.tooShortNames(user, untouched(user).copy(displayName = "Z")))
            .containsExactly(ProfileNameField.DISPLAY_NAME)
        assertThat(ProfileEditDiff.tooShortNames(user, untouched(user).copy(firstName = "A", lastName = "B", displayName = "C")))
            .containsExactly(ProfileNameField.FIRST_NAME, ProfileNameField.LAST_NAME, ProfileNameField.DISPLAY_NAME)
        assertThat(ProfileEditDiff.tooShortNames(user, untouched(user).copy(firstName = "Al", lastName = " Li ", displayName = "Sy")))
            .isEmpty()
    }

    @Test
    fun `an emptied name is not a too short name - it stays omitted`() {
        val user = original()

        assertThat(ProfileEditDiff.tooShortNames(user, untouched(user).copy(firstName = "", lastName = "   "))).isEmpty()
    }

    @Test
    fun `an untouched legacy one character name is not refused and is not sent`() {
        val user = original().copy(firstName = "A")

        assertThat(ProfileEditDiff.tooShortNames(user, untouched(user))).isEmpty()
        assertThat(ProfileEditDiff.request(user, untouched(user))).isEqualTo(UpdateProfileRequest())
    }

    @Test
    fun `a too short name never leaves in the request`() {
        val user = original()

        val request = ProfileEditDiff.request(user, untouched(user).copy(firstName = "A", displayName = "Alicia"))

        assertThat(request).isEqualTo(UpdateProfileRequest(displayName = "Alicia"))
    }

    @Test
    fun `a field identical to the original once trimmed is omitted`() {
        val user = original()

        val request = ProfileEditDiff.request(user, untouched(user).copy(firstName = " Alice ", bio = "hi  "))

        assertThat(request).isEqualTo(UpdateProfileRequest())
    }

    @Test
    fun `a regional language tag is brought back to its primary language`() {
        val user = original()

        val request = ProfileEditDiff.request(user, untouched(user).copy(regionalLanguage = "fr-FR"))

        assertThat(request.regionalLanguage).isEqualTo("fr")
    }

    @Test
    fun `a primary language equal to the original once normalised is omitted`() {
        val user = original()

        val request = ProfileEditDiff.request(user, untouched(user).copy(systemLanguage = "FR_ca"))

        assertThat(request.systemLanguage).isNull()
    }

    @Test
    fun `an invalid language code never leaves`() {
        val user = original()

        val request = ProfileEditDiff.request(
            user,
            untouched(user).copy(systemLanguage = "français", customDestinationLanguage = "1x"),
        )

        assertThat(request.systemLanguage).isNull()
        assertThat(request.customDestinationLanguage).isNull()
    }

    @Test
    fun `the bio is capped at five hundred characters`() {
        val user = original()

        val request = ProfileEditDiff.request(user, untouched(user).copy(bio = "a".repeat(600)))

        assertThat(request.bio).hasLength(ProfileEditDiff.BIO_MAX_LENGTH)
    }

    @Test
    fun `without an original every non blank field is sent and blanks stay omitted`() {
        val request = ProfileEditDiff.request(
            null,
            ProfileEditBuffers(displayName = "Alice", bio = "", regionalLanguage = "en"),
        )

        assertThat(request).isEqualTo(UpdateProfileRequest(displayName = "Alice", regionalLanguage = "en"))
    }

    @Test
    fun `combining two pending edits keeps the older field the newer one omits`() {
        val combined = ProfileEditDiff.combine(
            older = UpdateProfileRequest(bio = "", displayName = "Old"),
            newer = UpdateProfileRequest(displayName = "New", regionalLanguage = "it"),
        )

        assertThat(combined).isEqualTo(
            UpdateProfileRequest(bio = "", displayName = "New", regionalLanguage = "it"),
        )
    }

    @Test
    fun `changedOrNil distinguishes untouched from cleared`() {
        assertThat(ProfileEditDiff.changedOrNil("", null)).isNull()
        assertThat(ProfileEditDiff.changedOrNil("", "bio")).isEqualTo("")
        assertThat(ProfileEditDiff.changedOrNil("bio", "bio")).isNull()
        assertThat(ProfileEditDiff.changedOrNil("new", "bio")).isEqualTo("new")
    }
}
