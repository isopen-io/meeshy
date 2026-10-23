package me.meeshy.sdk.outbox

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class OutboxKindCatalogTest {

    @Test
    fun `every kind has catalog metadata with a unique disk value`() {
        val metas = OutboxKind.entries.map(OutboxKindCatalog::metaFor)

        assertThat(metas.map { it.diskValue }).containsNoDuplicates()
        assertThat(metas).hasSize(OutboxKind.entries.size)
    }

    @Test
    fun `only background read receipts stay out of the sync indicator`() {
        assertThat(OutboxKindCatalog.syncIndicatorExcludedDiskValues).containsExactly("READ_RECEIPT")
        assertThat(OutboxKindCatalog.metaFor(OutboxKind.MARK_UNREAD).countsForSyncIndicator).isTrue()
        assertThat(OutboxKindCatalog.metaFor(OutboxKind.SEND_MESSAGE).countsForSyncIndicator).isTrue()
    }

    @Test
    fun `a failed row carrying the user's own words is never disposable`() {
        listOf(OutboxKind.SEND_MESSAGE, OutboxKind.EDIT_MESSAGE, OutboxKind.PUBLISH_STORY, OutboxKind.UPDATE_PROFILE)
            .forEach { assertThat(OutboxKindCatalog.metaFor(it).terminalDisposable).isFalse() }
    }

    @Test
    fun `idempotent toggles and receipts are disposable once terminal`() {
        listOf(OutboxKind.ADD_REACTION, OutboxKind.LIKE_POST, OutboxKind.READ_RECEIPT, OutboxKind.BLOCK_USER)
            .forEach { assertThat(OutboxKindCatalog.metaFor(it).terminalDisposable).isTrue() }
        assertThat(OutboxKindCatalog.terminalDisposableDiskValues).contains("UNLIKE_POST")
    }

    @Test
    fun `a disk value round trips to its kind`() {
        OutboxKind.entries.forEach {
            assertThat(OutboxKindCatalog.fromDiskValue(OutboxKindCatalog.metaFor(it).diskValue)).isEqualTo(it)
        }
    }
}
