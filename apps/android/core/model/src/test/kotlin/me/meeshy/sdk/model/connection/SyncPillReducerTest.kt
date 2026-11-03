package me.meeshy.sdk.model.connection

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.sync.OutboxNavigationSource
import me.meeshy.sdk.model.sync.OutboxUiIcon
import me.meeshy.sdk.model.sync.OutboxUiItem
import me.meeshy.sdk.model.sync.OutboxUiKind
import me.meeshy.sdk.model.sync.OutboxUiStatus
import org.junit.Test

class SyncPillReducerTest {
    private fun at(state: ConnectionPillState, t: Long) = SyncPillReducer.pill(state, t)

    @Test
    fun `a cold start that connects within the grace shows nothing, then nothing on connect`() {
        var s = SyncPillReducer.initial(ConnectionStatus.CONNECTING, now = 0)
        assertThat(at(s, 2_999)).isEqualTo(ConnectionPill.HIDDEN)
        s = SyncPillReducer.onStatus(s, ConnectionStatus.CONNECTED, 2_000)
        assertThat(at(s, 2_000)).isEqualTo(ConnectionPill.HIDDEN)
        assertThat(s.backOnlineUntil).isNull()
    }

    @Test
    fun `a quick reconnection never shows`() {
        var s = SyncPillReducer.initial(ConnectionStatus.CONNECTED, 0)
        s = SyncPillReducer.onStatus(s, ConnectionStatus.DISCONNECTED, 10_000)
        assertThat(at(s, 12_000)).isEqualTo(ConnectionPill.HIDDEN)
        s = SyncPillReducer.onStatus(s, ConnectionStatus.CONNECTED, 12_500)
        assertThat(at(s, 12_500)).isEqualTo(ConnectionPill.HIDDEN)
        assertThat(at(s, 20_000)).isEqualTo(ConnectionPill.HIDDEN)
    }

    @Test
    fun `a long drop shows after 3 seconds then confirms online for 4 seconds`() {
        var s = SyncPillReducer.initial(ConnectionStatus.CONNECTED, 0)
        s = SyncPillReducer.onStatus(s, ConnectionStatus.DISCONNECTED, 10_000)
        assertThat(SyncPillReducer.nextDeadline(s, 10_000)).isEqualTo(13_000)
        assertThat(at(s, 13_000)).isEqualTo(ConnectionPill.RECONNECTING)
        s = SyncPillReducer.onStatus(s, ConnectionStatus.CONNECTED, 15_000)
        assertThat(at(s, 15_000)).isEqualTo(ConnectionPill.BACK_ONLINE)
        assertThat(SyncPillReducer.nextDeadline(s, 15_000)).isEqualTo(19_000)
        assertThat(at(s, 18_999)).isEqualTo(ConnectionPill.BACK_ONLINE)
        assertThat(at(s, 19_000)).isEqualTo(ConnectionPill.HIDDEN)
        assertThat(SyncPillReducer.settle(s, 19_000).backOnlineUntil).isNull()
    }

    @Test
    fun `offline shows at once and its end is confirmed`() {
        var s = SyncPillReducer.initial(ConnectionStatus.CONNECTED, 0)
        s = SyncPillReducer.onStatus(s, ConnectionStatus.OFFLINE, 1_000)
        assertThat(at(s, 1_000)).isEqualTo(ConnectionPill.OFFLINE)
        s = SyncPillReducer.onStatus(s, ConnectionStatus.CONNECTED, 1_200)
        assertThat(at(s, 1_300)).isEqualTo(ConnectionPill.BACK_ONLINE)
    }

    @Test
    fun `back from offline into a waiting socket does not restart the grace`() {
        var s = SyncPillReducer.initial(ConnectionStatus.CONNECTED, 0)
        s = SyncPillReducer.onStatus(s, ConnectionStatus.OFFLINE, 1_000)
        s = SyncPillReducer.onStatus(s, ConnectionStatus.DISCONNECTED, 5_000)
        assertThat(at(s, 5_000)).isEqualTo(ConnectionPill.RECONNECTING)
    }

    @Test
    fun `syncing shows the sync pill and a new drop cancels the confirmation`() {
        var s = SyncPillReducer.initial(ConnectionStatus.CONNECTED, 0)
        s = SyncPillReducer.onStatus(s, ConnectionStatus.SYNCING, 100)
        assertThat(at(s, 100)).isEqualTo(ConnectionPill.SYNCING)
        s = SyncPillReducer.onStatus(s, ConnectionStatus.OFFLINE, 200)
        s = SyncPillReducer.onStatus(s, ConnectionStatus.CONNECTED, 300)
        s = SyncPillReducer.onStatus(s, ConnectionStatus.OFFLINE, 400)
        assertThat(s.backOnlineUntil).isNull()
    }

    private fun op(id: String, status: OutboxUiStatus = OutboxUiStatus.PENDING) = OutboxUiItem(
        id = id, kind = OutboxUiKind.MESSAGE, titlePreview = "x", iconKind = OutboxUiIcon.TEXT, attachmentCount = 0,
        source = OutboxNavigationSource.Conversation("c1", "m1"), status = status, createdAt = 1,
    )

    @Test
    fun `typing entries are one per closed conversation sorted by id`() {
        val entries = SyncPillReducer.entries(
            items = listOf(op("a")),
            typers = listOf(
                SyncPillTyper("c9", "zoe"), SyncPillTyper("c2", "adam"),
                SyncPillTyper("c2", "bob"), SyncPillTyper("open", "me"),
            ),
            openConversationId = "open",
        )
        assertThat(entries.map { it.id }).containsExactly("op:a", "typing:c2", "typing:c9").inOrder()
        val typing = entries[1]
        assertThat(typing.literalLabel).isEqualTo("@adam")
        assertThat(typing.scale).isEqualTo(1.6f)
        assertThat(typing.target).isEqualTo(OutboxNavigationSource.Conversation("c2", null))
    }

    @Test
    fun `a terminal operation is a retryable error entry`() {
        val failed = SyncPillEntry.forOperation(op("r", OutboxUiStatus.EXHAUSTED))
        assertThat(failed.isError).isTrue()
        assertThat(failed.retryOutboxId).isEqualTo("r")
        assertThat(failed.labelKey).isEqualTo("sync.pill.failed.message")
        assertThat(SyncPillEntry.forOperation(op("p")).retryOutboxId).isNull()
    }

    @Test
    fun `the display clears 6 seconds after the last new entry unless persistent`() {
        val one = listOf(SyncPillEntry.forOperation(op("a")))
        var d = SyncPillReducer.display(SyncPillDisplayState(), one, now = 1_000)
        assertThat(SyncPillReducer.isVisible(d, persistent = false, now = 6_999)).isTrue()
        assertThat(SyncPillReducer.isVisible(d, persistent = false, now = 7_000)).isFalse()
        assertThat(SyncPillReducer.isVisible(d, persistent = true, now = 70_000)).isTrue()
        assertThat(SyncPillReducer.clearDeadline(d, false, 1_000)).isEqualTo(7_000)
        d = SyncPillReducer.display(d, one, now = 5_000)
        assertThat(d.changedAt).isEqualTo(1_000)
        d = SyncPillReducer.display(d, one + SyncPillEntry.forOperation(op("b")), now = 5_000)
        assertThat(d.changedAt).isEqualTo(5_000)
        assertThat(SyncPillReducer.display(d, emptyList(), 6_000).entryIds).isEmpty()
    }
}
