package me.meeshy.sdk.auth

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.currentTime
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.auth.EmailVerificationWatchStatus
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class EmailVerificationWatcherTest {

    private fun scripted(vararg replies: NetworkResult<EmailVerificationWatchStatus>): Pair<EmailVerificationWatcher, () -> Int> {
        var calls = 0
        val source = EmailVerificationStatusSource {
            replies[minOf(calls++, replies.lastIndex)]
        }
        return EmailVerificationWatcher(source) to { calls }
    }

    private val pending = NetworkResult.Success(EmailVerificationWatchStatus.PENDING)
    private val proven = NetworkResult.Success(EmailVerificationWatchStatus.PROVEN)
    private val ended = NetworkResult.Success(EmailVerificationWatchStatus.ENDED)
    private val blip = NetworkResult.Failure(ApiError(message = "x", code = "NETWORK"))

    @Test
    fun `la veille lit toutes les 3 secondes puis s'arrete des que l'adresse est prouvee`() = runTest {
        val (watcher, calls) = scripted(pending, pending, proven)
        watcher.watch("tok").test {
            assertThat(awaitItem()).isEqualTo(EmailVerificationWatchStatus.PENDING)
            assertThat(currentTime).isEqualTo(0L)
            assertThat(awaitItem()).isEqualTo(EmailVerificationWatchStatus.PENDING)
            assertThat(currentTime).isEqualTo(3_000L)
            assertThat(awaitItem()).isEqualTo(EmailVerificationWatchStatus.PROVEN)
            assertThat(currentTime).isEqualTo(6_000L)
            awaitComplete()
        }
        assertThat(calls()).isEqualTo(3)
    }

    @Test
    fun `un jeton fini 401 ou 410 arrete la veille`() = runTest {
        val (watcher, calls) = scripted(ended)
        watcher.watch("tok").test {
            assertThat(awaitItem()).isEqualTo(EmailVerificationWatchStatus.ENDED)
            awaitComplete()
        }
        assertThat(calls()).isEqualTo(1)
    }

    @Test
    fun `une panne passagere n'emet rien et se rejoue`() = runTest {
        val (watcher, _) = scripted(blip, proven)
        watcher.watch("tok").test {
            assertThat(awaitItem()).isEqualTo(EmailVerificationWatchStatus.PROVEN)
            assertThat(currentTime).isEqualTo(3_000L)
            awaitComplete()
        }
    }

    @Test
    fun `la veille s'arrete au plafond de 15 minutes`() = runTest {
        val (watcher, calls) = scripted(pending)
        watcher.watch("tok").test {
            repeat(300) { awaitItem() }
            awaitComplete()
        }
        assertThat(calls()).isEqualTo(300)
        assertThat(currentTime).isEqualTo(15 * 60_000L)
    }

    @Test
    fun `annuler le collecteur arrete toute lecture`() = runTest {
        val (watcher, calls) = scripted(pending)
        watcher.watch("tok").test {
            awaitItem()
            cancelAndIgnoreRemainingEvents()
        }
        assertThat(calls()).isEqualTo(1)
    }
}
