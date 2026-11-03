package me.meeshy.sdk.model.syncpill

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.connection.ConnectionPill
import me.meeshy.sdk.model.connection.SyncPillEntry
import me.meeshy.sdk.model.sync.OutboxNavigationSource
import me.meeshy.sdk.model.sync.OutboxUiIcon
import me.meeshy.sdk.model.sync.OutboxUiItem
import me.meeshy.sdk.model.sync.OutboxUiKind
import me.meeshy.sdk.model.sync.OutboxUiStatus
import org.junit.Test

class SyncPillPresenterTest {
    private fun item(
        id: String = "o1",
        kind: OutboxUiKind = OutboxUiKind.MESSAGE,
        icon: OutboxUiIcon = OutboxUiIcon.TEXT,
        status: OutboxUiStatus = OutboxUiStatus.PENDING,
        source: OutboxNavigationSource = OutboxNavigationSource.Conversation("c1", "m1"),
    ) = OutboxUiItem(id, kind, null, icon, 0, source, status, 0)

    private fun op(vararg items: OutboxUiItem) = items.map(SyncPillEntry::forOperation)

    @Test
    fun `offline pill is an amber static row without activity dots`() {
        val rows = SyncPillPresenter.rows(ConnectionPill.OFFLINE, emptyList())
        assertThat(rows).hasSize(1)
        assertThat(rows[0].labelKey).isEqualTo("connection.offline")
        assertThat(rows[0].dotStyle).isEqualTo(SyncPillDotStyle.WARNING)
        assertThat(rows[0].glyph).isEqualTo(SyncPillGlyph.WIFI_OFF)
        assertThat(rows[0].showsActivityDots).isFalse()
        assertThat(rows[0].tapOutcome).isEqualTo(SyncPillTapOutcome.Advance)
    }

    @Test
    fun `back online is a transient green row`() {
        val row = SyncPillPresenter.rows(ConnectionPill.BACK_ONLINE, emptyList()).single()
        assertThat(row.labelKey).isEqualTo("connection.online")
        assertThat(row.dotStyle).isEqualTo(SyncPillDotStyle.SUCCESS)
        assertThat(row.glyph).isEqualTo(SyncPillGlyph.WIFI)
        assertThat(row.showsActivityDots).isFalse()
    }

    @Test
    fun `connecting and reconnecting differ by label and keep the dots`() {
        val connecting = SyncPillPresenter.rows(ConnectionPill.CONNECTING, emptyList()).single()
        val reconnecting = SyncPillPresenter.rows(ConnectionPill.RECONNECTING, emptyList()).single()
        assertThat(connecting.labelKey).isEqualTo("connection.connecting")
        assertThat(reconnecting.labelKey).isEqualTo("connection.reconnecting")
        assertThat(reconnecting.dotStyle).isEqualTo(SyncPillDotStyle.WARNING)
        assertThat(reconnecting.showsActivityDots).isTrue()
    }

    @Test
    fun `syncing without queue detail says Synchronisation, with detail the items speak`() {
        val bare = SyncPillPresenter.rows(ConnectionPill.SYNCING, emptyList()).single()
        assertThat(bare.labelKey).isEqualTo("connection.syncing")
        assertThat(bare.dotStyle).isEqualTo(SyncPillDotStyle.BRAND)
        val detailed = SyncPillPresenter.rows(ConnectionPill.SYNCING, op(item()))
        assertThat(detailed.map { it.labelKey }).containsExactly("sync.pill.sending.message")
    }

    @Test
    fun `hidden connection and empty queue show nothing`() {
        assertThat(SyncPillPresenter.rows(ConnectionPill.HIDDEN, emptyList())).isEmpty()
    }

    @Test
    fun `the connection row comes first, then operations, then typers by conversation id`() {
        val entries = op(item("a")) + listOf(SyncPillEntry.forTyping("c9", "zoe"), SyncPillEntry.forTyping("c2", "ana"))
        val rows = SyncPillPresenter.rows(ConnectionPill.OFFLINE, entries)
        assertThat(rows.map { it.id }).containsExactly("status.offline", "op:a", "typing:c9", "typing:c2").inOrder()
    }

    @Test
    fun `an operation is brand with dots and its glyph follows the medium`() {
        val audio = SyncPillPresenter.rows(ConnectionPill.HIDDEN, op(item(icon = OutboxUiIcon.AUDIO))).single()
        assertThat(audio.dotStyle).isEqualTo(SyncPillDotStyle.BRAND)
        assertThat(audio.showsActivityDots).isTrue()
        assertThat(audio.glyph).isEqualTo(SyncPillGlyph.MIC)
        fun glyph(icon: OutboxUiIcon) = SyncPillPresenter.rows(ConnectionPill.HIDDEN, op(item(icon = icon))).single().glyph
        assertThat(glyph(OutboxUiIcon.IMAGE)).isEqualTo(SyncPillGlyph.PHOTO)
        assertThat(glyph(OutboxUiIcon.VIDEO)).isEqualTo(SyncPillGlyph.PLAY)
        assertThat(glyph(OutboxUiIcon.FILE)).isEqualTo(SyncPillGlyph.ATTACH)
        assertThat(glyph(OutboxUiIcon.REACTION)).isEqualTo(SyncPillGlyph.MOOD)
        assertThat(glyph(OutboxUiIcon.STICKER)).isEqualTo(SyncPillGlyph.MOOD)
        assertThat(glyph(OutboxUiIcon.TEXT)).isEqualTo(SyncPillGlyph.NONE)
    }

    @Test
    fun `a permanent failure is red, static and carries the retry id`() {
        val row = SyncPillPresenter.rows(ConnectionPill.HIDDEN, op(item("x", status = OutboxUiStatus.EXHAUSTED))).single()
        assertThat(row.labelKey).isEqualTo("sync.pill.failed.message")
        assertThat(row.dotStyle).isEqualTo(SyncPillDotStyle.ERROR)
        assertThat(row.showsActivityDots).isFalse()
        assertThat(row.tapOutcome).isEqualTo(SyncPillTapOutcome.Retry("x"))
    }

    @Test
    fun `tap order is retry then navigate then advance`() {
        val nav = SyncPillPresenter.rows(ConnectionPill.HIDDEN, op(item())).single()
        assertThat(nav.tapOutcome).isEqualTo(SyncPillTapOutcome.Navigate(OutboxNavigationSource.Conversation("c1", "m1")))
        val unknown = SyncPillPresenter.rows(ConnectionPill.HIDDEN, op(item(source = OutboxNavigationSource.Unknown))).single()
        assertThat(unknown.tapOutcome).isEqualTo(SyncPillTapOutcome.Advance)
        val failedWithSource = SyncPillPresenter.rows(ConnectionPill.HIDDEN, op(item("f", status = OutboxUiStatus.FAILED))).single()
        assertThat(failedWithSource.tapOutcome).isEqualTo(SyncPillTapOutcome.Retry("f"))
    }

    @Test
    fun `a typer row is a literal handle leading to the conversation and enlarges the pill`() {
        val rows = SyncPillPresenter.rows(ConnectionPill.HIDDEN, listOf(SyncPillEntry.forTyping("c1", "ana")))
        assertThat(rows.single().literalLabel).isEqualTo("@ana")
        assertThat(rows.single().labelKey).isNull()
        assertThat(rows.single().tapOutcome).isEqualTo(SyncPillTapOutcome.Navigate(OutboxNavigationSource.Conversation("c1", null)))
        assertThat(SyncPillPresenter.size(rows)).isEqualTo(SyncPillSize.TYPING)
        assertThat(SyncPillPresenter.size(SyncPillPresenter.rows(ConnectionPill.OFFLINE, emptyList()))).isEqualTo(SyncPillSize.COMPACT)
    }

    @Test
    fun `warning and error rows keep the pill on screen`() {
        assertThat(SyncPillPresenter.isPersistent(SyncPillPresenter.rows(ConnectionPill.OFFLINE, emptyList()))).isTrue()
        assertThat(SyncPillPresenter.isPersistent(SyncPillPresenter.rows(ConnectionPill.HIDDEN, op(item(status = OutboxUiStatus.EXHAUSTED))))).isTrue()
        assertThat(SyncPillPresenter.isPersistent(SyncPillPresenter.rows(ConnectionPill.HIDDEN, op(item())))).isFalse()
        assertThat(SyncPillPresenter.isPersistent(SyncPillPresenter.rows(ConnectionPill.BACK_ONLINE, emptyList()))).isFalse()
    }

    @Test
    fun `metrics follow the size`() {
        assertThat(SyncPillMetrics.of(SyncPillSize.COMPACT).heightDp).isEqualTo(22f)
        assertThat(SyncPillMetrics.of(SyncPillSize.COMPACT).dotDp).isEqualTo(6f)
        assertThat(SyncPillMetrics.of(SyncPillSize.COMPACT).maxTextDp).isEqualTo(160f)
        assertThat(SyncPillMetrics.of(SyncPillSize.TYPING).heightDp).isEqualTo(35f)
        assertThat(SyncPillMetrics.of(SyncPillSize.TYPING).dotDp).isEqualTo(10f)
        assertThat(SyncPillMetrics.of(SyncPillSize.TYPING).maxTextDp).isEqualTo(220f)
    }

    @Test
    fun `activity dots cycle one to three`() {
        assertThat((0..4).map { SyncPillPresenter.activityDots(it) }).containsExactly(".", "..", "...", ".", "..").inOrder()
        assertThat(SyncPillPresenter.activityDots(-1)).isEqualTo("..")
        assertThat(SyncPillPresenter.RESERVED_DOTS).isEqualTo("...")
    }

    @Test
    fun `an announcement is a typing row among new rows`() {
        val rows = SyncPillPresenter.rows(ConnectionPill.OFFLINE, listOf(SyncPillEntry.forTyping("c1", "ana")))
        assertThat(SyncPillPresenter.announcesTyping(rows, newIds = setOf("status.offline"))).isFalse()
        assertThat(SyncPillPresenter.announcesTyping(rows, newIds = setOf("typing:c1"))).isTrue()
    }

    @Test
    fun `the row to show is clamped when the list shrank`() {
        val rows = SyncPillPresenter.rows(ConnectionPill.HIDDEN, op(item("a"), item("b")))
        assertThat(SyncPillPresenter.visibleRow(rows, 1)?.id).isEqualTo("op:b")
        assertThat(SyncPillPresenter.visibleRow(rows, 7)?.id).isEqualTo("op:b")
        assertThat(SyncPillPresenter.visibleRow(emptyList(), 0)).isNull()
    }
}
