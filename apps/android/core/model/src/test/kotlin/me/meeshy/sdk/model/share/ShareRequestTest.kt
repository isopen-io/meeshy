package me.meeshy.sdk.model.share

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ShareRequestTest {
    private fun media(i: Int, mime: String = "image/jpeg") = ShareMedia(id = "incoming:$i", mimeType = mime, bytes = 10)

    @Test
    fun `a request with neither text nor file has nothing to send`() {
        assertThat(ShareRequest.incoming(text = "  ", media = emptyList())).isNull()
        assertThat(ShareRequest.incoming(text = null, media = emptyList(), shortfalls = listOf(ShareShortfall.Unprepared))).isNull()
    }

    @Test
    fun `an incoming text is trimmed and kept as the subject text`() {
        val request = ShareRequest.incoming(text = "  salut  ", media = emptyList())!!
        assertThat(request.subject).isEqualTo(ShareSubject.Incoming("salut", emptyList()))
        assertThat(request.source).isEqualTo(ShareRequest.Source.INCOMING)
    }

    @Test
    fun `incoming files keep their order and the shortfalls travel with them`() {
        val request = ShareRequest.incoming(text = null, media = listOf(media(0), media(1)), shortfalls = listOf(ShareShortfall.OverBudget(3)))!!
        assertThat((request.subject as ShareSubject.Incoming).media.map { it.id }).containsExactly("incoming:0", "incoming:1").inOrder()
        assertThat(request.shortfalls).containsExactly(ShareShortfall.OverBudget(3))
    }

    @Test
    fun `a gathered intake becomes an incoming request with numbered media`() {
        val gathered = ShareGathered(
            content = "https://meeshy.me",
            media = listOf(ShareStagedMedia("s/0.jpg", "jpg", "image/jpeg", 42)),
            failures = listOf(ShareStagingError.NotAvailableOffline),
        )
        val request = ShareRequest.from(gathered)!!
        val subject = request.subject as ShareSubject.Incoming
        assertThat(subject.text).isEqualTo("https://meeshy.me")
        assertThat(subject.media.single().id).isEqualTo("incoming:0")
        assertThat(subject.media.single().bytes).isEqualTo(42L)
        assertThat(request.shortfalls).containsExactly(ShareShortfall.Unprepared)
    }

    @Test
    fun `every other door wraps its subject by source`() {
        assertThat(ShareRequest.of(ShareSubject.Text("a")).source).isEqualTo(ShareRequest.Source.TEXT)
        assertThat(ShareRequest.of(ShareSubject.Link("https://a.b")).source).isEqualTo(ShareRequest.Source.LINK)
        assertThat(ShareRequest.of(ShareSubject.Messages(emptyList(), null)).source).isEqualTo(ShareRequest.Source.MESSAGES)
    }
}
