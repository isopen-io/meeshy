package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.media.MediaUploadProgressLedger
import me.meeshy.sdk.media.UploadedAttachmentIds
import me.meeshy.sdk.model.media.MediaUploadProgress
import org.junit.Test

class ChatUploadProgressViewModelTest {

    @Test
    fun `l'ecran tend les octets en vol et sait quelle piece a deja atterri`() {
        val ledger = MediaUploadProgressLedger()
        val acknowledged = UploadedAttachmentIds()
        val source = ChatUploadProgressViewModel(ledger, acknowledged).progress

        ledger.report("cmid-b", 5L, 10L)
        acknowledged.record("cmid-a", "srv-a")

        assertThat(source.progress.value).containsExactly("cmid-b", MediaUploadProgress.Uploading(5L, 10L))
        assertThat(source.landed("cmid-a")).isTrue()
        assertThat(source.landed("cmid-b")).isFalse()
    }

    @Test
    fun `une conversation rouverte en plein televersement retrouve les octets deja partis, le registre etant celui de l'application`() {
        val ledger = MediaUploadProgressLedger()
        val acknowledged = UploadedAttachmentIds()
        val first = ChatUploadProgressViewModel(ledger, acknowledged)
        ledger.report("cmid-v", 40L, 100L)

        val reopened = ChatUploadProgressViewModel(ledger, acknowledged)

        assertThat(first).isNotSameInstanceAs(reopened)
        assertThat(reopened.progress.progress.value).containsExactly("cmid-v", MediaUploadProgress.Uploading(40L, 100L))
    }
}
