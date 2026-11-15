package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.SendAttempt
import me.meeshy.sdk.model.SendAttemptOrdinal
import me.meeshy.sdk.model.SendTransport
import org.junit.Test

private fun attempt(
    number: Int,
    outcome: String = "failure",
    transport: String = "rest",
    error: String? = null,
    startedAt: Long = number * 1_000L,
) = SendAttempt("cid_1", number, transport, startedAt, startedAt + 50, outcome, error)

class SendHistoryPresenterTest {

    @Test
    fun `un message recu n a pas de carte`() {
        assertThat(SendHistoryPresenter.present(listOf(attempt(1)), isMine = false)).isNull()
    }

    @Test
    fun `aucune tentative locale, aucune carte`() {
        assertThat(SendHistoryPresenter.present(emptyList(), isMine = true)).isNull()
    }

    @Test
    fun `les lignes sont chronologiques avec ordinal et transport`() {
        val history = SendHistoryPresenter.present(
            listOf(attempt(2, "success", "outbox"), attempt(1, "failure", "rest", "HTTP 503")),
            isMine = true,
        )!!

        assertThat(history.count).isEqualTo(2)
        assertThat(history.rows.map { it.ordinal }).containsExactly(SendAttemptOrdinal.First, SendAttemptOrdinal.Nth(2)).inOrder()
        assertThat(history.rows.map { it.transport }).containsExactly(SendTransport.REST, SendTransport.OUTBOX).inOrder()
        assertThat(history.firstAttemptAtMillis).isEqualTo(1_000L)
    }

    @Test
    fun `l erreur n apparait que sur un echec`() {
        val history = SendHistoryPresenter.present(
            listOf(attempt(1, "failure", error = "HTTP 503"), attempt(2, "success", error = "ignorée")),
            isMine = true,
        )!!

        assertThat(history.rows.map { it.error }).containsExactly("HTTP 503", null).inOrder()
        assertThat(history.rows.map { it.isSuccess }).containsExactly(false, true).inOrder()
    }

    @Test
    fun `une erreur vide est ignoree et un transport inconnu garde son mot brut`() {
        val row = SendHistoryPresenter.present(listOf(attempt(1, error = "  ", transport = "pigeon")), isMine = true)!!.rows.single()

        assertThat(row.error).isNull()
        assertThat(row.transport).isNull()
        assertThat(row.rawTransport).isEqualTo("pigeon")
    }
}
