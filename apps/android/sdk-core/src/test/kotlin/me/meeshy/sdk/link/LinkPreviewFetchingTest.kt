package me.meeshy.sdk.link

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage of [LinkPreviewFetching.outcomeFrom] — the pure "is this HTTP response
 * worth showing" gate. The IO (the actual GET) is the exempt glue in [OkHttpLinkPreviewFetcher];
 * this decision — status / content-type / visible-field gating — is the testable heart, mirroring
 * the post-fetch validation iOS `LinkPreviewFetcher` applies before handing metadata back.
 */
class LinkPreviewFetchingTest {

    private val url = "https://example.com/a"
    private val ogHtml = """
        <html><head>
        <meta property="og:title" content="Hello">
        <meta property="og:description" content="World">
        </head></html>
    """.trimIndent()

    @Test
    fun `a 2xx html page with visible og fields resolves to metadata`() {
        val outcome = LinkPreviewFetching.outcomeFrom(
            statusCode = 200, contentType = "text/html; charset=utf-8", body = ogHtml, url = url,
        )
        assertThat(outcome).isInstanceOf(LinkPreviewOutcome.Resolved::class.java)
        val metadata = (outcome as LinkPreviewOutcome.Resolved).metadata
        assertThat(metadata.title).isEqualTo("Hello")
        assertThat(metadata.description).isEqualTo("World")
    }

    @Test
    fun `a non-2xx status is empty regardless of body`() {
        assertThat(
            LinkPreviewFetching.outcomeFrom(404, "text/html", ogHtml, url),
        ).isEqualTo(LinkPreviewOutcome.Empty)
    }

    @Test
    fun `a redirect-range status is empty`() {
        assertThat(
            LinkPreviewFetching.outcomeFrom(301, "text/html", ogHtml, url),
        ).isEqualTo(LinkPreviewOutcome.Empty)
    }

    @Test
    fun `a non-html content type is empty even at 200`() {
        assertThat(
            LinkPreviewFetching.outcomeFrom(200, "application/pdf", ogHtml, url),
        ).isEqualTo(LinkPreviewOutcome.Empty)
    }

    @Test
    fun `an xhtml content type is parsed`() {
        assertThat(
            LinkPreviewFetching.outcomeFrom(200, "application/xhtml+xml", ogHtml, url),
        ).isInstanceOf(LinkPreviewOutcome.Resolved::class.java)
    }

    @Test
    fun `an absent content type is parsed leniently`() {
        assertThat(
            LinkPreviewFetching.outcomeFrom(200, null, ogHtml, url),
        ).isInstanceOf(LinkPreviewOutcome.Resolved::class.java)
    }

    @Test
    fun `a blank body is empty`() {
        assertThat(
            LinkPreviewFetching.outcomeFrom(200, "text/html", "   ", url),
        ).isEqualTo(LinkPreviewOutcome.Empty)
    }

    @Test
    fun `a null body is empty`() {
        assertThat(
            LinkPreviewFetching.outcomeFrom(200, "text/html", null, url),
        ).isEqualTo(LinkPreviewOutcome.Empty)
    }

    @Test
    fun `html with no visible fields falls back to empty`() {
        val bare = "<html><head><title>   </title></head><body>no og here</body></html>"
        assertThat(
            LinkPreviewFetching.outcomeFrom(200, "text/html", bare, url),
        ).isEqualTo(LinkPreviewOutcome.Empty)
    }

    @Test
    fun `the resolved metadata is keyed by the canonical url`() {
        val outcome = LinkPreviewFetching.outcomeFrom(
            statusCode = 200,
            contentType = "text/html",
            body = ogHtml,
            url = "https://example.com/a?utm_source=news&utm_campaign=x",
        )
        val metadata = (outcome as LinkPreviewOutcome.Resolved).metadata
        assertThat(metadata.id).isEqualTo("https://example.com/a")
    }
}
