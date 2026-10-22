package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class BirthDateAndDeletionDecodingTest {

    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

    @Test
    fun `no deletion request decodes as no status`() {
        val status = json.decodeFromString(AccountDeletionStatus.serializer(), "{}")

        assertThat(status.hasOpenRequest).isFalse()
    }

    @Test
    fun `an open deletion request keeps its dates`() {
        val status = json.decodeFromString(
            AccountDeletionStatus.serializer(),
            """{"status":"confirmed","gracePeriodEndsAt":"2026-11-01T00:00:00.000Z"}""",
        )

        assertThat(status.hasOpenRequest).isTrue()
        assertThat(status.gracePeriodEndsAt).isEqualTo("2026-11-01T00:00:00.000Z")
    }

    @Test
    fun `an unknown age class reads as unknown`() {
        val declaration = json.decodeFromString(
            BirthDateDeclaration.serializer(),
            """{"ageClass":"teen-ish"}""",
        )

        assertThat(declaration.ageClassKind).isEqualTo(AgeClass.UNKNOWN)
        assertThat(declaration.viewerWriteRestrictionGlobal).isFalse()
    }

    @Test
    fun `refusals are classified by code first then status`() {
        assertThat(BirthDateDeclarationError.classify(409, null))
            .isEqualTo(BirthDateDeclarationError.ALREADY_SET)
        assertThat(BirthDateDeclarationError.classify(400, "AGE_BELOW_MINIMUM"))
            .isEqualTo(BirthDateDeclarationError.BELOW_MINIMUM_AGE)
        assertThat(BirthDateDeclarationError.classify(400, null))
            .isEqualTo(BirthDateDeclarationError.INVALID_DATE)
        assertThat(BirthDateDeclarationError.classify(404, null))
            .isEqualTo(BirthDateDeclarationError.UNSUPPORTED)
        assertThat(BirthDateDeclarationError.classify(null, null))
            .isEqualTo(BirthDateDeclarationError.UNAVAILABLE)
    }
}
