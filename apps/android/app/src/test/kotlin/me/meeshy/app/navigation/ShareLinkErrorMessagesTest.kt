package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import me.meeshy.app.R
import org.junit.Test

class ShareLinkErrorMessagesTest {
    @Test
    fun `404, 410 and 403 each have their own message`() {
        assertThat(ShareLinkErrorMessages.resFor(404)).isEqualTo(R.string.deep_link_error_not_found)
        assertThat(ShareLinkErrorMessages.resFor(410)).isEqualTo(R.string.deep_link_error_inactive)
        assertThat(ShareLinkErrorMessages.resFor(403)).isEqualTo(R.string.deep_link_error_forbidden)
    }

    @Test
    fun `any other status, or none, falls back to the unresolved link message`() {
        assertThat(ShareLinkErrorMessages.resFor(500)).isEqualTo(R.string.deep_link_error_unresolved)
        assertThat(ShareLinkErrorMessages.resFor(null)).isEqualTo(R.string.deep_link_error_unresolved)
    }
}
