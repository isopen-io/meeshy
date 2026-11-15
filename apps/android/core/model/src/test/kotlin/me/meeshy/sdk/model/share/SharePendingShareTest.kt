package me.meeshy.sdk.model.share

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ClientIdFormat
import org.junit.Test

class SharePendingShareTest {

    private var counter = 0

    private fun media(name: String = "a.jpg") =
        ShareStagedMedia(relPath = "s1/$name", ext = "jpg", mime = "image/jpeg", bytes = 10, originalName = name)

    private fun share(
        conversations: List<String> = listOf("c1", "c2"),
        media: List<ShareStagedMedia> = emptyList(),
        owner: String? = "u1",
        createdAt: Long = 1_000L,
    ) = SharePendingShare.make(
        shareId = "s1",
        createdAt = createdAt,
        ownerUserId = owner,
        content = "hello",
        media = media,
        conversationIds = conversations,
        newClientMessageId = { "cid-${counter++}" },
    )

    @Test
    fun `each target gets its own persisted client message id`() {
        val made = share()
        assertThat(made.targets.map { it.clientMessageId }).containsExactly("cid-0", "cid-1").inOrder()
        assertThat(made.targets.map { it.state }).containsExactly(TargetState.PENDING, TargetState.PENDING)
    }

    @Test
    fun `default client message ids are valid cids`() {
        val made = SharePendingShare.make("s1", 0L, null, null, emptyList(), listOf("c1"))
        assertThat(ClientIdFormat.isValidCid(made.targets.single().clientMessageId)).isTrue()
    }

    @Test
    fun `the origin target carries the bytes only when there is media`() {
        assertThat(share().originTargetIndex).isNull()
        assertThat(share(media = listOf(media())).originTargetIndex).isEqualTo(0)
    }

    @Test
    fun `one served target does not serve the share`() {
        val after = share().markSent("c1", "m1")
        assertThat(after.isFullyServed).isFalse()
        assertThat(after.targets.first().serverMessageId).isEqualTo("m1")
        assertThat(after.remainingTargets.map { it.conversationId }).containsExactly("c2")
    }

    @Test
    fun `every target served serves the share`() {
        val after = share().markSent("c1", "m1").markSent("c2", "m2")
        assertThat(after.isFullyServed).isTrue()
    }

    @Test
    fun `a failed target is retried and never counts as served`() {
        val failed = share().markSent("c1", "m1").markFailed("c2")
        assertThat(failed.isFullyServed).isFalse()
        assertThat(failed.remainingTargets.map { it.conversationId }).containsExactly("c2")
        assertThat(failed.markSent("c2", "m2").isFullyServed).isTrue()
    }

    @Test
    fun `a sent target is never downgraded`() {
        val after = share().markSent("c1", "m1").markFailed("c1")
        assertThat(after.targets.first().state).isEqualTo(TargetState.SENT)
    }

    @Test
    fun `an unknown conversation changes nothing`() {
        val made = share()
        assertThat(made.markSent("zz", "m")).isEqualTo(made)
    }

    @Test
    fun `an upload is recorded once and dispenses re-uploading`() {
        val uploaded = share(media = listOf(media())).withUploadedAttachments(listOf("att1"))
        assertThat(uploaded.uploadedAttachmentIds).containsExactly("att1")
        assertThat(uploaded.needsUpload).isFalse()
        assertThat(share(media = listOf(media())).needsUpload).isTrue()
        assertThat(share().needsUpload).isFalse()
    }

    @Test
    fun `a share without owner is served to any account, otherwise to its depositor only`() {
        assertThat(share(owner = null).isServedTo("anyone")).isTrue()
        assertThat(share(owner = "u1").isServedTo("u1")).isTrue()
        assertThat(share(owner = "u1").isServedTo("u2")).isFalse()
        assertThat(share(owner = "u1").isServedTo(null)).isFalse()
    }

    @Test
    fun `a share expires after seven days`() {
        val made = share(createdAt = 1_000L)
        val week = 7L * 24 * 60 * 60 * 1000
        assertThat(made.isExpired(1_000L + week - 1)).isFalse()
        assertThat(made.isExpired(1_000L + week)).isTrue()
    }

    @Test
    fun `the codec round trips a share`() {
        val made = share(media = listOf(media())).markSent("c1", "m1").withUploadedAttachments(listOf("a"))
        val decoded = SharePendingShareCodec.decode(SharePendingShareCodec.encode(made))
        assertThat(decoded).isEqualTo(SharePendingShareCodec.Decoded.Readable(made))
    }

    @Test
    fun `an unknown schema version is reported, not guessed`() {
        val text = """{"v":99,"clientMessageId":"s1","createdAt":1,"media":[],"targets":[]}"""
        assertThat(SharePendingShareCodec.decode(text)).isEqualTo(SharePendingShareCodec.Decoded.UnknownVersion(99))
    }

    @Test
    fun `garbage is corrupt`() {
        assertThat(SharePendingShareCodec.decode("{not json")).isEqualTo(SharePendingShareCodec.Decoded.Corrupt)
        assertThat(SharePendingShareCodec.decode("""{"v":1}""")).isEqualTo(SharePendingShareCodec.Decoded.Corrupt)
    }

    @Test
    fun `unknown fields of the current version are tolerated`() {
        val text = SharePendingShareCodec.encode(share()).replaceFirst("{", """{"future":1,""")
        assertThat(SharePendingShareCodec.decode(text)).isInstanceOf(SharePendingShareCodec.Decoded.Readable::class.java)
    }

    @Test
    fun `a refused target leaves the share and the origin follows the first target kept`() {
        val made = share(conversations = listOf("c1", "c2", "c3"), media = listOf(media()))
        val kept = made.withoutTarget("c1")
        assertThat(kept.targets.map { it.conversationId }).containsExactly("c2", "c3").inOrder()
        assertThat(kept.originTargetIndex).isEqualTo(0)
    }

    @Test
    fun `removing a target before the origin shifts the origin index`() {
        val made = share(conversations = listOf("c1", "c2", "c3"), media = listOf(media())).copy(originTargetIndex = 2)
        val kept = made.withoutTarget("c1")
        assertThat(kept.originTargetIndex).isEqualTo(1)
        assertThat(kept.targets[kept.originTargetIndex!!].conversationId).isEqualTo("c3")
    }

    @Test
    fun `removing every target leaves a fully served share that the store deletes`() {
        val kept = share(conversations = listOf("c1")).withoutTarget("c1")
        assertThat(kept.targets).isEmpty()
        assertThat(kept.isFullyServed).isTrue()
        assertThat(kept.originTargetIndex).isNull()
    }
}
