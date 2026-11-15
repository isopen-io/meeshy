package me.meeshy.sdk.user

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.slot
import java.io.IOException
import java.time.ZoneId
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.BirthDateDeclaration
import me.meeshy.sdk.model.BirthDateDeclarationError
import me.meeshy.sdk.model.BirthDateRequest
import me.meeshy.sdk.net.api.UserApi
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

class BirthDateRepositoryTest {

    private val instant = 954_892_800_000L + 23 * 3_600_000L // 2000-04-05T23:00:00Z

    private fun refusal(status: Int, body: String = """{"success":false}"""): HttpException =
        HttpException(Response.error<Any>(status, body.toResponseBody("application/json".toMediaType())))

    @Test
    fun `the body carries the civil day of the device zone`() = runTest {
        val api = mockk<UserApi>()
        val sent = slot<BirthDateRequest>()
        coEvery { api.setBirthDate(capture(sent)) } returns
            ApiResponse(success = true, data = BirthDateDeclaration("adult", false))

        BirthDateRepository(api).setBirthDate(instant, ZoneId.of("Pacific/Auckland"))

        assertThat(sent.captured.birthDate).isEqualTo("2000-04-06")
    }

    @Test
    fun `a tolerant answer keeps the age class and the write restriction`() = runTest {
        val api = mockk<UserApi>()
        coEvery { api.setBirthDate(any()) } returns
            ApiResponse(success = true, data = BirthDateDeclaration("minor", true))

        val outcome = BirthDateRepository(api).setBirthDate(instant, ZoneId.of("UTC"))

        val declared = outcome as BirthDateOutcome.Declared
        assertThat(declared.declaration.viewerWriteRestrictionGlobal).isTrue()
    }

    @Test
    fun `a minor declaration closes writing and an adult one leaves it open`() = runTest {
        val api = mockk<UserApi>()
        val repository = BirthDateRepository(api)
        coEvery { api.setBirthDate(any()) } returns
            ApiResponse(success = true, data = BirthDateDeclaration("minor", true))
        repository.setBirthDate(instant, ZoneId.of("UTC"))
        assertThat(repository.writeRestricted.value).isTrue()

        coEvery { api.setBirthDate(any()) } returns
            ApiResponse(success = true, data = BirthDateDeclaration("adult", false))
        repository.setBirthDate(instant, ZoneId.of("UTC"))
        assertThat(repository.writeRestricted.value).isFalse()
    }

    @Test
    fun `refusals are classified`() = runTest {
        val cases = mapOf(
            409 to BirthDateDeclarationError.ALREADY_SET,
            422 to BirthDateDeclarationError.BELOW_MINIMUM_AGE,
            400 to BirthDateDeclarationError.INVALID_DATE,
            404 to BirthDateDeclarationError.UNSUPPORTED,
            503 to BirthDateDeclarationError.UNAVAILABLE,
        )
        cases.forEach { (status, expected) ->
            val api = mockk<UserApi>()
            coEvery { api.setBirthDate(any()) } throws refusal(status)

            val outcome = BirthDateRepository(api).setBirthDate(instant, ZoneId.of("UTC"))

            assertThat(outcome).isEqualTo(BirthDateOutcome.Refused(expected))
        }
    }

    @Test
    fun `a transport failure is unavailable and never blocks a retry`() = runTest {
        val api = mockk<UserApi>()
        coEvery { api.setBirthDate(any()) } throws IOException("offline")

        val outcome = BirthDateRepository(api).setBirthDate(instant, ZoneId.of("UTC"))

        assertThat(outcome).isEqualTo(BirthDateOutcome.Refused(BirthDateDeclarationError.UNAVAILABLE))
        coVerify(exactly = 1) { api.setBirthDate(any()) }
    }
}
