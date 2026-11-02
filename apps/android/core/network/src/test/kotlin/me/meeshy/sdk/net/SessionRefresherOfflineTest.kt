package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import okhttp3.Request
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
import java.io.IOException

/**
 * #14078 — un renouvellement qui n'atteint pas la passerelle n'est pas un refus. Hors ligne (ou passerelle en panne), la
 * session et sa sauvegarde Block Store (#14058, ADR-029) restent, et elle se renouvelle au retour du réseau, comme iOS.
 * Seul un REFUS de la passerelle (4xx hors 408 / 429, ou une réponse qui dit non) démonte la session.
 */
class SessionRefresherOfflineTest {

    private class RecordingBackup : SessionBackup {
        var erasures = 0
        var held: BackedUpSession? = null
        override suspend fun read(): BackedUpSession? = held
        override fun save(session: BackedUpSession) { held = session }
        override fun erase() { erasures += 1; held = null }
    }

    private class Fixture(outcome: suspend (String) -> String?) {
        val backup = RecordingBackup()
        val store = BackedUpTokenStore(InMemoryTokenStore(), backup).apply {
            jwt = "jwt-1"
            sessionToken = "sess-1"
            userId = "u1"
        }
        var answer: suspend (String) -> String? = outcome
        val refresher = SessionRefresher(store, nowEpochSeconds = { Double.MAX_VALUE }) { answer(it) }
    }

    private fun refused(code: Int, body: String = "{}") = HttpException(Response.error<Any>(code, body.toResponseBody()))

    private fun carrying(jwt: String): Request =
        RequestCredential.Bearer(jwt).applyTo(Request.Builder().url("https://gate.meeshy.me/api/v1/conversations")).build()

    @Test
    fun `une panne de transport garde la session et sa sauvegarde`() = runTest {
        val f = Fixture { throw IOException("Unable to resolve host") }

        val renewal = f.refresher.renew("jwt-1", sentUnderGeneration = null)

        assertThat(renewal).isEqualTo(Renewal.Deferred)
        assertThat(f.store.jwt).isEqualTo("jwt-1")
        assertThat(f.store.sessionToken).isEqualTo("sess-1")
        assertThat(f.backup.erasures).isEqualTo(0)
        assertThat(f.backup.held).isNotNull()
    }

    @Test
    fun `une passerelle en panne, un proxy, un portail, un delai ou une limite ne sont pas des refus`() = runTest {
        listOf(500, 502, 503, 400, 403, 404, 407, 408, 429).forEach { code ->
            val f = Fixture { throw refused(code) }

            assertThat(f.refresher.renew("jwt-1", sentUnderGeneration = null)).isEqualTo(Renewal.Deferred)
            assertThat(f.store.isAuthenticated).isTrue()
            assertThat(f.backup.erasures).isEqualTo(0)
        }
    }

    @Test
    fun `seul un refus de la passerelle demonte la session et efface la sauvegarde`() = runTest {
        listOf(
            refused(401),
            refused(401, """{"success":false,"error":"Session revoquee","code":"SESSION_REVOKED"}"""),
            refused(403, """{"success":false,"error":"13 ans","code":"AGE_BELOW_MINIMUM"}"""),
        ).forEach { refusal ->
            val f = Fixture { throw refusal }

            assertThat(f.refresher.renew("jwt-1", sentUnderGeneration = null)).isEqualTo(Renewal.Failed)
            assertThat(f.store.isAuthenticated).isFalse()
            assertThat(f.backup.erasures).isEqualTo(1)
        }
    }

    @Test
    fun `une reponse qui dit non demonte toujours la session`() = runTest {
        val f = Fixture { null }

        assertThat(f.refresher.renew("jwt-1", sentUnderGeneration = null)).isEqualTo(Renewal.Failed)
        assertThat(f.store.isAuthenticated).isFalse()
    }

    @Test
    fun `au retour du reseau la meme session se renouvelle`() = runTest {
        val f = Fixture { throw IOException("offline") }
        f.refresher.renew("jwt-1", sentUnderGeneration = null)

        f.answer = { "jwt-2" }
        val renewal = f.refresher.renew("jwt-1", sentUnderGeneration = null)

        assertThat((renewal as Renewal.Renewed).jwt).isEqualTo("jwt-2")
        assertThat(f.backup.held?.jwt).isEqualTo("jwt-2")
    }

    @Test
    fun `le 401 d'une requete dont le renouvellement n'a pas abouti n'annonce pas d'expiration`() = runTest {
        val f = Fixture { throw IOException("offline") }
        f.refresher.renew("jwt-1", sentUnderGeneration = null)

        assertThat(f.refresher.signalsExpiry(carrying("jwt-1"))).isFalse()
    }

    @Test
    fun `apres un renouvellement abouti, un 401 du nouveau jeton annonce de nouveau l'expiration`() = runTest {
        val f = Fixture { throw IOException("offline") }
        f.refresher.renew("jwt-1", sentUnderGeneration = null)
        f.answer = { "jwt-2" }
        f.refresher.renew("jwt-1", sentUnderGeneration = null)

        assertThat(f.refresher.signalsExpiry(carrying("jwt-2"))).isTrue()
    }

    @Test
    fun `le jeton frais demande hors ligne rend le jeton detenu sans deconnecter`() = runTest {
        val f = Fixture { throw IOException("offline") }

        assertThat(f.refresher.freshAuthToken()).isEqualTo("jwt-1")
        assertThat(f.store.isAuthenticated).isTrue()
    }

    @Test
    fun `une session videe ailleurs apres un renouvellement non joint ne garde pas le silence du jeton non joint`() = runTest {
        val deferred = Fixture { throw IOException("offline") }
        deferred.refresher.renew("jwt-1", sentUnderGeneration = null)
        val never = Fixture { throw IOException("offline") }

        deferred.store.clear()
        never.store.clear()

        assertThat(deferred.refresher.signalsExpiry(carrying("jwt-1")))
            .isEqualTo(never.refresher.signalsExpiry(carrying("jwt-1")))
    }
}
