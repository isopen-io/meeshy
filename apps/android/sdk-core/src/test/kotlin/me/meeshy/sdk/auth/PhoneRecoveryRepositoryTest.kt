package me.meeshy.sdk.auth

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.coVerifyOrder
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.auth.MaskedUserInfo
import me.meeshy.sdk.model.auth.PhoneProofRefusal
import me.meeshy.sdk.model.auth.PhoneRecoveryCodeData
import me.meeshy.sdk.model.auth.PhoneRecoveryCodeRequest
import me.meeshy.sdk.model.auth.PhoneRecoveryIdentityData
import me.meeshy.sdk.model.auth.PhoneRecoveryIdentityRequest
import me.meeshy.sdk.model.auth.PhoneRecoveryLookupData
import me.meeshy.sdk.model.auth.PhoneRecoveryLookupRequest
import me.meeshy.sdk.model.auth.PhoneRecoveryResendRequest
import me.meeshy.sdk.model.auth.PhoneRecoveryState
import me.meeshy.sdk.model.auth.PhoneRecoveryStep
import me.meeshy.sdk.net.api.AuthApi
import org.junit.Test
import java.io.IOException

/**
 * La recuperation par telephone, etape par etape : ce que chaque etape envoie, comment
 * elle enchaine sur la suivante, et le refus TYPE que la passerelle motive en chaine
 * machine dans `error` (un 400 sans `code`).
 */
class PhoneRecoveryRepositoryTest {

    private val masked = MaskedUserInfo(displayName = "Ata Beth", username = "a*****h", email = "at....h@m*****om")

    private fun <T> refused(message: String, code: String? = null) = ApiResponse<T>(success = false, error = message, code = code)

    private fun <T> PhoneProofResult<T>.refusal(): PhoneProofRefusal = (this as PhoneProofResult.Refused).refusal

    @Suppress("UNCHECKED_CAST")
    private fun <T> PhoneProofResult<T>.done(): T = (this as PhoneProofResult.Done<T>).value

    @Test
    fun `le parcours entier enchaine les quatre routes avec les jetons rendus`() = runTest {
        val api = mockk<AuthApi>()
        coEvery { api.phoneRecoveryLookup(any()) } returns
            ApiResponse(success = true, data = PhoneRecoveryLookupData("tok-1", masked))
        coEvery { api.phoneRecoveryVerifyIdentity(any()) } returns
            ApiResponse(success = true, data = PhoneRecoveryIdentityData(codeSent = true))
        coEvery { api.phoneRecoveryVerifyCode(any()) } returns
            ApiResponse(success = true, data = PhoneRecoveryCodeData("reset-9"))
        val repository = PhoneRecoveryRepository(api)

        var state = PhoneRecoveryState.INITIAL
        val lookup = repository.lookup("+33612345678", "FR").done()
        state = state.onLookupSuccess(lookup.maskedUserInfo)
        val identity = repository.verifyIdentity(lookup.tokenId, "atabeth", "ata@meeshy.me").done()
        if (identity.codeSent) state = state.onIdentityVerified()
        val code = repository.verifyCode(lookup.tokenId, "123456").done()
        state = state.onCodeVerified(code.resetToken)

        assertThat(state.step).isEqualTo(PhoneRecoveryStep.RESET)
        assertThat(state.resetToken).isEqualTo("reset-9")
        coVerifyOrder {
            api.phoneRecoveryLookup(PhoneRecoveryLookupRequest("+33612345678", "FR"))
            api.phoneRecoveryVerifyIdentity(PhoneRecoveryIdentityRequest("tok-1", "atabeth", "ata@meeshy.me"))
            api.phoneRecoveryVerifyCode(PhoneRecoveryCodeRequest("tok-1", "123456"))
        }
    }

    @Test
    fun `l'identite est envoyee sans bords blancs`() = runTest {
        val api = mockk<AuthApi>()
        coEvery { api.phoneRecoveryVerifyIdentity(any()) } returns
            ApiResponse(success = true, data = PhoneRecoveryIdentityData(codeSent = true))

        PhoneRecoveryRepository(api).verifyIdentity("tok-1", "  atabeth ", " ata@meeshy.me\n")

        coVerify { api.phoneRecoveryVerifyIdentity(PhoneRecoveryIdentityRequest("tok-1", "atabeth", "ata@meeshy.me")) }
    }

    @Test
    fun `le code est reduit a ses six chiffres`() = runTest {
        val api = mockk<AuthApi>()
        coEvery { api.phoneRecoveryVerifyCode(any()) } returns
            ApiResponse(success = true, data = PhoneRecoveryCodeData("reset-9"))

        PhoneRecoveryRepository(api).verifyCode("tok-1", "12 34-56 78")

        coVerify { api.phoneRecoveryVerifyCode(PhoneRecoveryCodeRequest("tok-1", "123456")) }
    }

    @Test
    fun `un numero sans compte verifie est un refus type de la recherche`() = runTest {
        val api = mockk<AuthApi>()
        coEvery { api.phoneRecoveryLookup(any()) } returns refused("user_not_found")

        assertThat(PhoneRecoveryRepository(api).lookup("+33600000000").refusal()).isEqualTo(PhoneProofRefusal.ACCOUNT_NOT_FOUND)
        coEvery { api.phoneRecoveryLookup(any()) } returns refused("phone_not_verified")
        assertThat(PhoneRecoveryRepository(api).lookup("+33600000000").refusal()).isEqualTo(PhoneProofRefusal.PHONE_NOT_VERIFIED)
        coEvery { api.phoneRecoveryLookup(any()) } returns refused("invalid_phone")
        assertThat(PhoneRecoveryRepository(api).lookup("12").refusal()).isEqualTo(PhoneProofRefusal.INVALID_PHONE)
    }

    @Test
    fun `une mauvaise identite et des essais epuises ne se confondent pas`() = runTest {
        val api = mockk<AuthApi>()
        val repository = PhoneRecoveryRepository(api)

        coEvery { api.phoneRecoveryVerifyIdentity(any()) } returns refused("identity_mismatch")
        assertThat(repository.verifyIdentity("tok-1", "x", "x@y.z").refusal()).isEqualTo(PhoneProofRefusal.IDENTITY_MISMATCH)

        coEvery { api.phoneRecoveryVerifyIdentity(any()) } returns refused("max_attempts_exceeded")
        assertThat(repository.verifyIdentity("tok-1", "x", "x@y.z").refusal()).isEqualTo(PhoneProofRefusal.ATTEMPTS_EXHAUSTED)

        coEvery { api.phoneRecoveryVerifyIdentity(any()) } returns refused("token_expired")
        assertThat(repository.verifyIdentity("tok-1", "x", "x@y.z").refusal()).isEqualTo(PhoneProofRefusal.SESSION_EXPIRED)
    }

    @Test
    fun `un code faux et un code expire sont deux refus de l'etape du code`() = runTest {
        val api = mockk<AuthApi>()
        val repository = PhoneRecoveryRepository(api)

        coEvery { api.phoneRecoveryVerifyCode(any()) } returns refused("invalid_code")
        assertThat(repository.verifyCode("tok-1", "000000").refusal()).isEqualTo(PhoneProofRefusal.CODE_INVALID)

        coEvery { api.phoneRecoveryVerifyCode(any()) } returns refused("code_expired")
        assertThat(repository.verifyCode("tok-1", "000000").refusal()).isEqualTo(PhoneProofRefusal.CODE_EXPIRED)
    }

    @Test
    fun `un renvoi trop rapproche demande d'attendre`() = runTest {
        val api = mockk<AuthApi>()
        coEvery { api.phoneRecoveryResend(any()) } returns refused("rate_limited")

        val result = PhoneRecoveryRepository(api).resend("tok-1")

        assertThat(result.refusal()).isEqualTo(PhoneProofRefusal.RATE_LIMITED)
        coVerify { api.phoneRecoveryResend(PhoneRecoveryResendRequest("tok-1")) }
    }

    @Test
    fun `le renvoi reussi ne porte rien`() = runTest {
        val api = mockk<AuthApi>()
        coEvery { api.phoneRecoveryResend(any()) } returns ApiResponse(success = true)

        assertThat(PhoneRecoveryRepository(api).resend("tok-1")).isEqualTo(PhoneProofResult.Done(Unit))
    }

    @Test
    fun `une panne de transport est hors ligne, pas un refus`() = runTest {
        val api = mockk<AuthApi>()
        coEvery { api.phoneRecoveryLookup(any()) } throws IOException("offline")

        assertThat(PhoneRecoveryRepository(api).lookup("+33612345678").refusal()).isEqualTo(PhoneProofRefusal.OFFLINE)
    }

    @Test
    fun `un motif inconnu est un echec generique`() = runTest {
        val api = mockk<AuthApi>()
        coEvery { api.phoneRecoveryLookup(any()) } returns refused("quelque_chose_de_neuf")

        assertThat(PhoneRecoveryRepository(api).lookup("+33612345678").refusal()).isEqualTo(PhoneProofRefusal.FAILED)
    }
}
