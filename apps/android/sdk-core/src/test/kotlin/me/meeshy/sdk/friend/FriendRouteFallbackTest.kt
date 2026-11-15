package me.meeshy.sdk.friend

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.Test

/**
 * Le repli vers l'ancienne adresse ne suit QUE « cette passerelle ne sert pas la route » :
 * un 404 du HANDLER (« demande introuvable ») dit autre chose, et rejouer chaque demande
 * deja traitee sur l'alias repousserait son retrait, qui attend un decompte nul d'appels
 * Android (#4275).
 */
class FriendRouteFallbackTest {

    private fun failure(status: Int?, message: String) =
        NetworkResult.Failure(ApiError(message = message, code = status?.let { "HTTP_$it" }, httpStatus = status))

    @Test
    fun `the generic router 404 means the route is not served`() {
        assertThat(ApiError(message = "Not Found", code = "HTTP_404", httpStatus = 404).isRouteNotServed()).isTrue()
        assertThat(ApiError(message = "not found ", code = "HTTP_404", httpStatus = 404).isRouteNotServed()).isTrue()
    }

    @Test
    fun `a handler 404 with its own message does not`() {
        val error = ApiError(message = "Demande d'ami non trouvee", code = "HTTP_404", httpStatus = 404)

        assertThat(error.isRouteNotServed()).isFalse()
    }

    @Test
    fun `other statuses never do, whatever they say`() {
        assertThat(ApiError(message = "Not Found", httpStatus = 500).isRouteNotServed()).isFalse()
        assertThat(ApiError(message = "Not Found", httpStatus = null).isRouteNotServed()).isFalse()
    }

    @Test
    fun `the legacy call runs only when the canonical route is not served`() = runTest {
        var legacyCalls = 0
        val legacy: suspend () -> NetworkResult<String> = { legacyCalls++; NetworkResult.Success("legacy") }

        val missed = canonicalOrLegacy({ failure(404, "Not Found") }, legacy)
        val gone = canonicalOrLegacy({ failure(404, "Demande d'ami non trouvee") }, legacy)
        val served = canonicalOrLegacy({ NetworkResult.Success("canonical") }, legacy)

        assertThat(missed).isEqualTo(NetworkResult.Success("legacy"))
        assertThat(gone).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat(served).isEqualTo(NetworkResult.Success("canonical"))
        assertThat(legacyCalls).isEqualTo(1)
    }
}
