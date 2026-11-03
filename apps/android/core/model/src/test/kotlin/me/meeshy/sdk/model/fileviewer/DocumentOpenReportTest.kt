package me.meeshy.sdk.model.fileviewer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.AttachmentStatusBody
import org.junit.Test

class DocumentOpenReportTest {

    @Test
    fun `l'ouverture d'un document recu se rapporte comme vue, pas comme telechargee`() {
        val body = DocumentOpenReport.bodyForOpening(isMine = false)
        assertThat(body?.action).isEqualTo(AttachmentStatusBody.ACTION_VIEWED)
        assertThat(body?.complete).isTrue()
        assertThat(body?.action).isNotEqualTo(AttachmentStatusBody.ACTION_DOWNLOADED)
    }

    @Test
    fun `son propre document ne rapporte rien`() {
        assertThat(DocumentOpenReport.bodyForOpening(isMine = true)).isNull()
    }
}
