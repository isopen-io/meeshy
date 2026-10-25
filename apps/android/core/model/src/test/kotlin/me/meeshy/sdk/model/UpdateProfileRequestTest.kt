package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.profile.ProfileEditDiff
import org.junit.Test

/**
 * The PATCH body on the wire: `null` is ABSENT (the gateway leaves the field alone) while the
 * empty string is SENT (the gateway clears the field). Same encoder settings as `MeeshyApi.json`.
 */
class UpdateProfileRequestTest {

    private val json = Json { encodeDefaults = false; explicitNulls = false; ignoreUnknownKeys = true }

    @Test
    fun `null fields are omitted from the body`() {
        val body = json.encodeToString(UpdateProfileRequest.serializer(), UpdateProfileRequest(displayName = "Alicia"))

        assertThat(body).isEqualTo("""{"displayName":"Alicia"}""")
    }

    @Test
    fun `an empty string is sent so the gateway clears the field`() {
        val body = json.encodeToString(
            UpdateProfileRequest.serializer(),
            UpdateProfileRequest(bio = "", customDestinationLanguage = ""),
        )

        assertThat(body).isEqualTo("""{"bio":"","customDestinationLanguage":""}""")
    }

    @Test
    fun `a cleared field survives a round trip through the queue`() {
        val request = UpdateProfileRequest(bio = "", regionalLanguage = "")

        val decoded = json.decodeFromString(
            UpdateProfileRequest.serializer(),
            json.encodeToString(UpdateProfileRequest.serializer(), request),
        )

        assertThat(decoded).isEqualTo(request)
    }

    @Test
    fun `language codes are validated and brought back to their primary language`() {
        assertThat(ProfileEditDiff.normalizeLanguage("fr-FR")).isEqualTo("fr")
        assertThat(ProfileEditDiff.normalizeLanguage(" EN ")).isEqualTo("en")
        assertThat(ProfileEditDiff.normalizeLanguage("")).isEqualTo("")
        assertThat(ProfileEditDiff.normalizeLanguage(null)).isEqualTo("")
        assertThat(ProfileEditDiff.normalizeLanguage("english")).isNull()
        assertThat(ProfileEditDiff.normalizeLanguage("e1")).isNull()
    }
}
