package me.meeshy.app.chat.share

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.share.ShareDelivery
import me.meeshy.sdk.model.share.ShareFailure
import me.meeshy.sdk.model.share.ShareLimits
import me.meeshy.sdk.model.share.ShareRecipient
import me.meeshy.sdk.model.share.ShareSheetState
import me.meeshy.sdk.model.share.ShareSubject
import me.meeshy.sdk.model.share.ShareTitle
import org.junit.Test

class ShareSheetUiStateTest {
    private fun person(i: Int) = ShareRecipient.person("u$i", "Personne $i", ShareRecipient.Detail.FriendWithoutConversation, null)

    private fun state(
        sheet: ShareSheetState = ShareSheetState(),
        subject: ShareSubject? = ShareSubject.Text("bonjour"),
    ) = ShareSheetUiState(subject = subject, sheet = sheet, isLoading = false)

    private fun sheetWith(vararg entries: Pair<ShareRecipient, ShareDelivery?>): ShareSheetState {
        var sheet = ShareSheetState(selection = entries.map { it.first })
        entries.forEach { (r, d) -> if (d != null) sheet = sheet.withDelivery(r.id, d) }
        return sheet
    }

    @Test
    fun `before anything is sent the left button says cancel and nothing is finished`() {
        val s = state(sheetWith(person(1) to null))
        assertThat(s.closeReplacesCancel).isFalse()
        assertThat(s.isFinished).isFalse()
        assertThat(s.autoCloses).isFalse()
    }

    @Test
    fun `once a row is sent cancel becomes close`() {
        val s = state(sheetWith(person(1) to ShareDelivery.Sent, person(2) to ShareDelivery.Sending))
        assertThat(s.closeReplacesCancel).isTrue()
        assertThat(s.isFinished).isFalse()
    }

    @Test
    fun `a clean finish closes by itself`() {
        val s = state(sheetWith(person(1) to ShareDelivery.Sent, person(2) to ShareDelivery.Queued))
        assertThat(s.isFinished).isTrue()
        assertThat(s.autoCloses).isTrue()
    }

    @Test
    fun `a failure keeps the sheet open and offers to retry all`() {
        val s = state(sheetWith(person(1) to ShareDelivery.Sent, person(2) to ShareDelivery.Failed(ShareFailure.GENERIC)))
        assertThat(s.isFinished).isTrue()
        assertThat(s.failedIds).containsExactly("user:u2")
        assertThat(s.autoCloses).isFalse()
        assertThat(s.offersRetryAll).isTrue()
    }

    @Test
    fun `the tenth recipient is the last one that can be ticked`() {
        val full = state(ShareSheetState(selection = (1..ShareLimits.MAX_RECIPIENTS).map(::person)))
        assertThat(full.selectionIsFull).isTrue()
        assertThat(state(ShareSheetState(selection = (1..9).map(::person))).selectionIsFull).isFalse()
    }

    @Test
    fun `a text entry sends and a fully protected message is blocked`() {
        assertThat(state().plan?.title).isEqualTo(ShareTitle.SEND)
        assertThat(state().blocked).isNull()
        assertThat(state(subject = null).plan).isNull()
    }
}
