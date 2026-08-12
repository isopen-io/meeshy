package me.meeshy.sdk.link

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * The pure card-presentation decision surface. A long-pressed / rendered message text plus the
 * async fetch outcome collapse into exactly one [LinkPreviewState], so the Composable owns no
 * branching of its own (every testable decision lives here).
 */
class LinkPreviewStateTest {

    private val meta = LinkMetadata(
        id = "https://x.com/p",
        title = "Title",
        description = "Desc",
        imageUrl = "https://x.com/a.png",
        siteName = "X",
    )

    @Test
    fun `no url in the text yields None regardless of outcome`() {
        assertThat(LinkPreview.stateFor("plain text", LinkPreviewOutcome.Pending))
            .isEqualTo(LinkPreviewState.None)
        assertThat(LinkPreview.stateFor("plain text", LinkPreviewOutcome.Resolved(meta)))
            .isEqualTo(LinkPreviewState.None)
        assertThat(LinkPreview.stateFor("plain text", LinkPreviewOutcome.Empty))
            .isEqualTo(LinkPreviewState.None)
    }

    @Test
    fun `a url that is still fetching yields Loading carrying the detected url`() {
        assertThat(LinkPreview.stateFor("see https://x.com/p now", LinkPreviewOutcome.Pending))
            .isEqualTo(LinkPreviewState.Loading("https://x.com/p"))
    }

    @Test
    fun `a resolved fetch yields a rich Card of the metadata`() {
        assertThat(LinkPreview.stateFor("see https://x.com/p", LinkPreviewOutcome.Resolved(meta)))
            .isEqualTo(LinkPreviewState.Card(meta))
    }

    @Test
    fun `an empty fetch falls back to a bare tappable link`() {
        assertThat(LinkPreview.stateFor("see https://x.com/p", LinkPreviewOutcome.Empty))
            .isEqualTo(LinkPreviewState.BareLink("https://x.com/p"))
    }

    @Test
    fun `Loading and BareLink report the normalised url from a bare www host`() {
        assertThat(LinkPreview.stateFor("go www.x.com", LinkPreviewOutcome.Pending))
            .isEqualTo(LinkPreviewState.Loading("https://www.x.com"))
        assertThat(LinkPreview.stateFor("go www.x.com", LinkPreviewOutcome.Empty))
            .isEqualTo(LinkPreviewState.BareLink("https://www.x.com"))
    }

    @Test
    fun `hasPreview is true only when a url is present`() {
        assertThat(LinkPreview.hasPreview("plain")).isFalse()
        assertThat(LinkPreview.hasPreview("see https://x.com")).isTrue()
    }
}
