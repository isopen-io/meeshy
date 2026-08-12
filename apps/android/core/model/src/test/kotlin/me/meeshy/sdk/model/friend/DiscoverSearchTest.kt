package me.meeshy.sdk.model.friend

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class DiscoverSearchTest {

    // MARK: - DiscoverSearch.action

    @Test
    fun `blank query clears`() {
        assertThat(DiscoverSearch.action("")).isEqualTo(DiscoverSearchAction.Clear)
    }

    @Test
    fun `whitespace-only query clears`() {
        assertThat(DiscoverSearch.action("   ")).isEqualTo(DiscoverSearchAction.Clear)
    }

    @Test
    fun `single character is below threshold and clears`() {
        assertThat(DiscoverSearch.action("a")).isEqualTo(DiscoverSearchAction.Clear)
    }

    @Test
    fun `a two-character query is exactly at the boundary and searches`() {
        assertThat(DiscoverSearch.action("ab")).isEqualTo(DiscoverSearchAction.Search("ab"))
    }

    @Test
    fun `a longer query searches with the raw text`() {
        assertThat(DiscoverSearch.action("alice")).isEqualTo(DiscoverSearchAction.Search("alice"))
    }

    @Test
    fun `surrounding whitespace is trimmed before the length check`() {
        assertThat(DiscoverSearch.action("  bob  ")).isEqualTo(DiscoverSearchAction.Search("bob"))
    }

    @Test
    fun `a single visible character padded with whitespace still clears`() {
        assertThat(DiscoverSearch.action("  x  ")).isEqualTo(DiscoverSearchAction.Clear)
    }

    // MARK: - ConnectAction.from

    @Test
    fun `current user resolves to a hidden action`() {
        assertThat(ConnectAction.from(UserRelationshipState.Current)).isEqualTo(ConnectAction.Hidden)
    }

    @Test
    fun `no relationship resolves to connect`() {
        assertThat(ConnectAction.from(UserRelationshipState.None)).isEqualTo(ConnectAction.Connect)
    }

    @Test
    fun `an already-sent request resolves to pending`() {
        assertThat(ConnectAction.from(UserRelationshipState.PendingSent("req-1")))
            .isEqualTo(ConnectAction.Pending)
    }

    @Test
    fun `a received request resolves to accept carrying its request id`() {
        assertThat(ConnectAction.from(UserRelationshipState.PendingReceived("req-9")))
            .isEqualTo(ConnectAction.Accept("req-9"))
    }

    @Test
    fun `an accepted friend resolves to contact`() {
        assertThat(ConnectAction.from(UserRelationshipState.Connected)).isEqualTo(ConnectAction.Contact)
    }

    @Test
    fun `a blocked user resolves to blocked`() {
        assertThat(ConnectAction.from(UserRelationshipState.Blocked)).isEqualTo(ConnectAction.Blocked)
    }
}
