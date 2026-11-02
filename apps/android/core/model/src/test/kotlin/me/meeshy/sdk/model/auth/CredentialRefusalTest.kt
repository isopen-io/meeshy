package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CredentialRefusalTest {

    @Test
    fun `a transport failure is offline whatever its message says`() {
        assertThat(CredentialRefusal.classify(code = "NETWORK", httpStatus = null)).isEqualTo(CredentialRefusal.OFFLINE)
    }

    @Test
    fun `a 429 or a rate-limit code is too many attempts`() {
        assertThat(CredentialRefusal.classify(code = null, httpStatus = 429)).isEqualTo(CredentialRefusal.TOO_MANY_ATTEMPTS)
        assertThat(CredentialRefusal.classify(code = "RATE_LIMITED", httpStatus = 400)).isEqualTo(CredentialRefusal.TOO_MANY_ATTEMPTS)
        assertThat(CredentialRefusal.classify(code = "RATE_LIMIT_EXCEEDED", httpStatus = 403)).isEqualTo(CredentialRefusal.TOO_MANY_ATTEMPTS)
    }

    @Test
    fun `a refused or expired verification code is named as such`() {
        assertThat(CredentialRefusal.classify(code = "INVALID_VERIFICATION", httpStatus = 400)).isEqualTo(CredentialRefusal.INVALID_CODE)
        assertThat(CredentialRefusal.classify(code = "VERIFICATION_EXPIRED", httpStatus = 410)).isEqualTo(CredentialRefusal.EXPIRED_CODE)
    }

    @Test
    fun `another client error is a rejection whose server reason may be shown`() {
        assertThat(CredentialRefusal.classify(code = "INVALID_CREDENTIALS", httpStatus = 401)).isEqualTo(CredentialRefusal.REJECTED)
        assertThat(CredentialRefusal.classify(code = null, httpStatus = 400)).isEqualTo(CredentialRefusal.REJECTED)
        assertThat(CredentialRefusal.classify(code = null, httpStatus = null)).isEqualTo(CredentialRefusal.REJECTED)
    }

    @Test
    fun `a server error, a parse failure or an unread answer is unexpected`() {
        assertThat(CredentialRefusal.classify(code = null, httpStatus = 503)).isEqualTo(CredentialRefusal.UNEXPECTED)
        assertThat(CredentialRefusal.classify(code = "PARSE", httpStatus = null)).isEqualTo(CredentialRefusal.UNEXPECTED)
        assertThat(CredentialRefusal.classify(code = "UNSUPPORTED_LOGIN_RESPONSE", httpStatus = null)).isEqualTo(CredentialRefusal.UNEXPECTED)
    }

    @Test
    fun `only a rejection lets the server reason through, and only when it says something`() {
        assertThat(CredentialRefusal.REJECTED.serverReason("Mot de passe incorrect")).isEqualTo("Mot de passe incorrect")
        assertThat(CredentialRefusal.REJECTED.serverReason("  ")).isNull()
        assertThat(CredentialRefusal.OFFLINE.serverReason("Unable to resolve host gate.meeshy.me")).isNull()
        assertThat(CredentialRefusal.UNEXPECTED.serverReason("Unknown error")).isNull()
    }
}
