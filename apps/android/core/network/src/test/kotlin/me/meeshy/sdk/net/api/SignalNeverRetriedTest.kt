package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.signal.EncryptedSendDecision
import me.meeshy.sdk.model.signal.EncryptedSendGate
import me.meeshy.sdk.model.signal.EstablishSessionRequest
import me.meeshy.sdk.model.signal.SignalFailure
import me.meeshy.sdk.model.signal.SignalPreKeyBundle
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.NeverRetried
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.net.isNeverRetried
import okhttp3.Interceptor
import okhttp3.Response
import org.junit.Test

/**
 * Les routes Signal ne sont JAMAIS rejouées, et leur échec ferme la
 * conversation chiffrée au lieu de l'ouvrir en clair.
 *
 * Elles ont un limiteur de débit serré (5 à 30 requêtes par minute) contre le
 * raclage de clés, et une session établie deux fois consomme une pré-clé de plus.
 * Un 503 `E2EE_UNAVAILABLE` est le serveur qui REFUSE de simuler une session
 * chiffrée : le rejouer ne la rendra pas réelle.
 *
 * ## Pourquoi un réessayeur d'essai, et ce qu'il prouve
 *
 * Aucune couche de réessai n'existe encore dans le client de production : sans
 * elle, « un seul appel » serait vrai de TOUTE route et le témoin ne protégerait
 * rien. [ReplaysServerErrors] est le contrat qu'une telle couche doit tenir —
 * rejouer les 5xx, sauf quand la requête est marquée [NeverRetried]. Son témoin
 * NÉGATIF (une route ordinaire rejouée trois fois) est ce qui rend le « un seul »
 * des routes Signal non vacueux.
 */
class SignalNeverRetriedTest {

    private val unavailable =
        """{"success":false,"error":"End-to-end encryption is not available on this server","code":"E2EE_UNAVAILABLE"}"""

    private val bundle = SignalPreKeyBundle(
        identityKey = "ik",
        registrationId = 1,
        deviceId = 1,
        signedPreKeyId = 2,
        signedPreKeyPublic = "spk",
        signedPreKeySignature = "sig",
    )

    /** Rejoue un 5xx jusqu'à [attempts] fois en tout — sauf une requête [NeverRetried]. */
    private class ReplaysServerErrors(private val attempts: Int) : Interceptor {
        override fun intercept(chain: Interceptor.Chain): Response {
            val request = chain.request()
            var response = chain.proceed(request)
            var made = 1
            while (!request.isNeverRetried() && response.code >= 500 && made < attempts) {
                response.close()
                response = chain.proceed(request)
                made += 1
            }
            return response
        }
    }

    private fun failing(status: Int = 503, body: String = unavailable) =
        RecordingHttp(status = status, responseBody = body, outer = ReplaysServerErrors(attempts = 3))

    private fun signalCalls(signal: SignalApi): List<suspend () -> NetworkResult<*>> =
        listOf<suspend () -> NetworkResult<*>>(
            { apiCall { signal.uploadKeys(bundle) } },
            { apiCall { signal.keysFor("68b0000000000000000000bb") } },
            { apiCall { signal.establishSession(EstablishSessionRequest("u2", "c1")) } },
        )

    @Test
    fun `a 503 on any Signal route is attempted exactly once`() = runTest {
        val outcomes = listOf(0, 1, 2).map { index ->
            val http = failing()
            val result = signalCalls(http.serve(SignalApi::class.java))[index]()
            http.requests.size to result
        }

        outcomes.forEach { (attempts, result) ->
            assertThat(attempts).isEqualTo(1)
            assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        }
    }

    /** Le témoin négatif : la même couche rejoue une route ordinaire, donc le « un seul » ci-dessus n'est pas vacuous. */
    @Test
    fun `an ordinary route is replayed by the same layer`() = runTest {
        val http = failing(body = """{"success":false,"error":"boom"}""")

        apiCall { http.serve(CallApi::class.java).details("68b0000000000000000000aa") }

        assertThat(http.requests).hasSize(3)
    }

    @Test
    fun `every Signal request carries the never-retried mark and an ordinary one does not`() = runTest {
        val signalHttp = RecordingHttp(responseBody = """{"success":true,"data":{}}""")
        val signal = signalHttp.serve(SignalApi::class.java)
        apiCall { signal.uploadKeys(bundle) }
        apiCall { signal.keysFor("u2") }
        apiCall { signal.establishSession(EstablishSessionRequest("u2", "c1")) }

        val ordinaryHttp = RecordingHttp(responseBody = """{"success":true,"data":{}}""")
        apiCall { ordinaryHttp.serve(CallApi::class.java).clearHistory() }

        assertThat(signalHttp.requests).hasSize(3)
        assertThat(signalHttp.requests.map { it.request.isNeverRetried() }).containsExactly(true, true, true)
        assertThat(ordinaryHttp.only.request.isNeverRetried()).isFalse()
    }

    @Test
    fun `the interface itself is marked so a route added later is protected without anyone remembering`() {
        assertThat(SignalApi::class.java.isAnnotationPresent(NeverRetried::class.java)).isTrue()
    }

    // ── Fail-closed : de l'échec réseau à la décision d'envoi ────────────────

    @Test
    fun `a refused session blocks an encrypted conversation and leaves a clear one alone`() = runTest {
        val http = failing()

        val result = apiCall {
            http.serve(SignalApi::class.java).establishSession(EstablishSessionRequest("u2", "c1"))
        }

        val error: ApiError = (result as NetworkResult.Failure).error
        assertThat(error.httpStatus).isEqualTo(503)
        assertThat(error.code).isEqualTo("E2EE_UNAVAILABLE")

        val failure = SignalFailure.from(error.httpStatus, error.code)
        assertThat(failure).isEqualTo(SignalFailure.SERVER_UNAVAILABLE)
        assertThat(EncryptedSendGate.afterSignalFailure(conversationEncrypted = true, failure = failure))
            .isEqualTo(EncryptedSendDecision.Blocked(SignalFailure.SERVER_UNAVAILABLE))
        assertThat(EncryptedSendGate.afterSignalFailure(conversationEncrypted = false, failure = failure))
            .isEqualTo(EncryptedSendDecision.Proceed)
    }

    @Test
    fun `missing keys also block an encrypted conversation`() = runTest {
        val http = failing(status = 404, body = """{"success":false,"error":"User has not generated encryption keys"}""")

        val result = apiCall { http.serve(SignalApi::class.java).keysFor("68b0000000000000000000bb") }

        val error = (result as NetworkResult.Failure).error
        val failure = SignalFailure.from(error.httpStatus, error.code)
        assertThat(failure).isEqualTo(SignalFailure.KEYS_NOT_PUBLISHED)
        assertThat(EncryptedSendGate.afterSignalFailure(true, failure))
            .isEqualTo(EncryptedSendDecision.Blocked(SignalFailure.KEYS_NOT_PUBLISHED))
        assertThat(http.requests).hasSize(1)
    }
}
