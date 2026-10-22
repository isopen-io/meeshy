package me.meeshy.sdk.auth

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.coVerifyOrder
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.auth.PhoneOwnerMaskedInfo
import me.meeshy.sdk.model.auth.PhoneOwnershipCheckData
import me.meeshy.sdk.model.auth.PhoneOwnershipCheckRequest
import me.meeshy.sdk.model.auth.PhoneProofRefusal
import me.meeshy.sdk.model.auth.PhoneTransferInitiateData
import me.meeshy.sdk.model.auth.PhoneTransferInitiateRegistrationData
import me.meeshy.sdk.model.auth.PhoneTransferInitiateRegistrationRequest
import me.meeshy.sdk.model.auth.PhoneTransferInitiateRequest
import me.meeshy.sdk.model.auth.PhoneTransferSessionRequest
import me.meeshy.sdk.model.auth.PhoneTransferVerifyData
import me.meeshy.sdk.model.auth.PhoneTransferVerifyRegistrationData
import me.meeshy.sdk.model.auth.PhoneTransferVerifyRequest
import me.meeshy.sdk.net.api.PhoneTransferApi
import org.junit.Test
import java.io.IOException

/**
 * Le transfert d'un numero, sur ses deux parcours — compte cree (`initiate` -> `verify`)
 * et inscription (`initiate-registration` -> `verify-registration`) — et les refus
 * types de chaque etape.
 */
class PhoneTransferRepositoryTest {

    private val owner = PhoneOwnerMaskedInfo(displayName = "Ata", username = "a**h", email = "a...h@m***")

    private fun <T> refused(message: String) = ApiResponse<T>(success = false, error = message)

    private fun <T> PhoneProofResult<T>.refusal(): PhoneProofRefusal = (this as PhoneProofResult.Refused).refusal

    @Suppress("UNCHECKED_CAST")
    private fun <T> PhoneProofResult<T>.done(): T = (this as PhoneProofResult.Done<T>).value

    @Test
    fun `sur un compte cree, le transfert enchaine initiate puis verify avec le transferId rendu`() = runTest {
        val api = mockk<PhoneTransferApi>()
        coEvery { api.check(any()) } returns
            ApiResponse(success = true, data = PhoneOwnershipCheckData(maskedInfo = owner, recoverySuggested = false))
        coEvery { api.initiate(any()) } returns
            ApiResponse(success = true, data = PhoneTransferInitiateData("tr-1", owner))
        coEvery { api.verify(any()) } returns ApiResponse(success = true, data = PhoneTransferVerifyData(transferred = true))
        val repository = PhoneTransferRepository(api)

        repository.check("+33612345678", countryCode = "FR")
        val initiated = repository.initiate("+33612345678", newUserId = "u2", phoneCountryCode = "FR").done()
        val verified = repository.verify(initiated.transferId, "123456").done()

        assertThat(verified.transferred).isTrue()
        coVerifyOrder {
            api.check(PhoneOwnershipCheckRequest("+33612345678", countryCode = "FR"))
            api.initiate(PhoneTransferInitiateRequest("+33612345678", phoneCountryCode = "FR", newUserId = "u2"))
            api.verify(PhoneTransferVerifyRequest("tr-1", "123456"))
        }
    }

    @Test
    fun `pendant l'inscription, le jeton de transfert sort de la verification`() = runTest {
        val api = mockk<PhoneTransferApi>()
        coEvery { api.initiateRegistration(any()) } returns
            ApiResponse(success = true, data = PhoneTransferInitiateRegistrationData("tr-2"))
        coEvery { api.verifyRegistration(any()) } returns
            ApiResponse(success = true, data = PhoneTransferVerifyRegistrationData(verified = true, transferToken = "xfer-1"))
        val repository = PhoneTransferRepository(api)

        val initiated = repository.initiateRegistration("0612345678", "ata", "a@b.co", phoneCountryCode = "FR").done()
        val verified = repository.verifyRegistration(initiated.transferId, "123456").done()

        assertThat(verified.transferToken).isEqualTo("xfer-1")
        coVerifyOrder {
            api.initiateRegistration(
                PhoneTransferInitiateRegistrationRequest("0612345678", phoneCountryCode = "FR", pendingUsername = "ata", pendingEmail = "a@b.co"),
            )
            api.verifyRegistration(PhoneTransferVerifyRequest("tr-2", "123456"))
        }
    }

    @Test
    fun `l'identite declaree vide ne part pas`() = runTest {
        val api = mockk<PhoneTransferApi>()
        coEvery { api.check(any()) } returns ApiResponse(success = true, data = PhoneOwnershipCheckData())

        PhoneTransferRepository(api).check("+33612345678", firstName = "  ", lastName = "")

        coVerify { api.check(PhoneOwnershipCheckRequest("+33612345678")) }
    }

    @Test
    fun `le code est reduit a ses six chiffres`() = runTest {
        val api = mockk<PhoneTransferApi>()
        coEvery { api.verify(any()) } returns ApiResponse(success = true, data = PhoneTransferVerifyData(true))
        coEvery { api.verifyRegistration(any()) } returns
            ApiResponse(success = true, data = PhoneTransferVerifyRegistrationData(true, "x"))
        val repository = PhoneTransferRepository(api)

        repository.verify("tr-1", "12 34 56")
        repository.verifyRegistration("tr-2", "654-321")

        coVerify { api.verify(PhoneTransferVerifyRequest("tr-1", "123456")) }
        coVerify { api.verifyRegistration(PhoneTransferVerifyRequest("tr-2", "654321")) }
    }

    @Test
    fun `le renvoi et l'annulation n'envoient que la session de transfert`() = runTest {
        val api = mockk<PhoneTransferApi>()
        coEvery { api.resend(any()) } returns ApiResponse(success = true)
        coEvery { api.cancel(any()) } returns ApiResponse(success = true)
        val repository = PhoneTransferRepository(api)

        assertThat(repository.resend("tr-1")).isEqualTo(PhoneProofResult.Done(Unit))
        assertThat(repository.cancel("tr-1")).isEqualTo(PhoneProofResult.Done(Unit))

        coVerify { api.resend(PhoneTransferSessionRequest("tr-1")) }
        coVerify { api.cancel(PhoneTransferSessionRequest("tr-1")) }
    }

    @Test
    fun `chaque etape a ses refus types`() = runTest {
        val api = mockk<PhoneTransferApi>()
        val repository = PhoneTransferRepository(api)

        coEvery { api.initiate(any()) } returns refused("phone_not_found")
        assertThat(repository.initiate("+33600000000", "u2").refusal()).isEqualTo(PhoneProofRefusal.ACCOUNT_NOT_FOUND)

        coEvery { api.initiate(any()) } returns refused("sms_send_failed")
        assertThat(repository.initiate("+33600000000", "u2").refusal()).isEqualTo(PhoneProofRefusal.SMS_FAILED)

        coEvery { api.verify(any()) } returns refused("invalid_code")
        assertThat(repository.verify("tr-1", "000000").refusal()).isEqualTo(PhoneProofRefusal.CODE_INVALID)

        coEvery { api.verify(any()) } returns refused("max_attempts_exceeded")
        assertThat(repository.verify("tr-1", "000000").refusal()).isEqualTo(PhoneProofRefusal.ATTEMPTS_EXHAUSTED)

        coEvery { api.verify(any()) } returns refused("transfer_expired")
        assertThat(repository.verify("tr-1", "000000").refusal()).isEqualTo(PhoneProofRefusal.SESSION_EXPIRED)

        coEvery { api.resend(any()) } returns refused("rate_limited")
        assertThat(repository.resend("tr-1").refusal()).isEqualTo(PhoneProofRefusal.RATE_LIMITED)

        coEvery { api.verifyRegistration(any()) } returns refused("invalid_transfer_token")
        assertThat(repository.verifyRegistration("tr-2", "000000").refusal()).isEqualTo(PhoneProofRefusal.SESSION_EXPIRED)

        coEvery { api.initiateRegistration(any()) } returns refused("Numéro de téléphone invalide")
        assertThat(repository.initiateRegistration("12", "ata", "a@b.co").refusal()).isEqualTo(PhoneProofRefusal.INVALID_PHONE)
    }

    @Test
    fun `une panne de transport est hors ligne, pas un refus`() = runTest {
        val api = mockk<PhoneTransferApi>()
        coEvery { api.check(any()) } throws IOException("offline")

        assertThat(PhoneTransferRepository(api).check("+33612345678").refusal()).isEqualTo(PhoneProofRefusal.OFFLINE)
    }
}
