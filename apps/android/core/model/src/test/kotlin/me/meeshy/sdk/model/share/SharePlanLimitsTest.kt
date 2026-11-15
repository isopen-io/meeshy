package me.meeshy.sdk.model.share

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Les bornes exactes : fichiers, octets, destinataires, publication. */
class SharePlanLimitsTest {
    private fun file(i: Int, bytes: Long = 1L) = ShareMedia(id = "f$i", mimeType = "application/pdf", bytes = bytes)
    private fun image(i: Int) = ShareMedia(id = "i$i", mimeType = "image/jpeg", bytes = 1L)
    private fun to(n: Int) = (1..n).map { ShareDestination("c$it") }
    private fun send(media: List<ShareMedia>, n: Int = 1) = SharePlanner.plan(ShareEntry.Media(media), to(n))

    @Test
    fun `exactly the file ceiling trims nothing and one more trims one`() {
        assertThat(SharePlanner.trimCount((1..ShareLimits.MAX_FILES).map { file(it) })).isEqualTo(0)
        assertThat(SharePlanner.trimCount((1..ShareLimits.MAX_FILES + 1).map { file(it) })).isEqualTo(1)
        assertThat(SharePlanner.trimCount((1..ShareLimits.MAX_FILES + 5).map { file(it) })).isEqualTo(5)
    }

    @Test
    fun `exactly the byte ceiling fits and one byte over trims the last piece`() {
        val half = ShareLimits.MAX_TOTAL_BYTES / 2
        assertThat(SharePlanner.trimCount(listOf(file(1, half), file(2, half)))).isEqualTo(0)
        assertThat(SharePlanner.trimCount(listOf(file(1, half), file(2, half + 1)))).isEqualTo(1)
    }

    @Test
    fun `a piece alone over the byte ceiling trims everything`() {
        assertThat(SharePlanner.trimCount(listOf(file(1, ShareLimits.MAX_TOTAL_BYTES + 1)))).isEqualTo(1)
        assertThat(SharePlanner.trimCount(emptyList())).isEqualTo(0)
    }

    @Test
    fun `unknown and negative sizes weigh nothing`() {
        assertThat(SharePlanner.trimCount(listOf(ShareMedia(id = "a", mimeType = "image/png"), file(2, -5L)))).isEqualTo(0)
    }

    @Test
    fun `canSend flips exactly at ten recipients and at zero`() {
        assertThat(send(listOf(file(1)), 0).canSend).isFalse()
        assertThat(send(listOf(file(1)), 1).canSend).isTrue()
        assertThat(send(listOf(file(1)), ShareLimits.MAX_RECIPIENTS).canSend).isTrue()
        val over = send(listOf(file(1)), ShareLimits.MAX_RECIPIENTS + 1)
        assertThat(over.canSend).isFalse()
        assertThat(over.limits.overRecipients).isEqualTo(1)
        assertThat(over.limits.recipients).isEqualTo(11)
    }

    @Test
    fun `canSend is false while pieces must be trimmed`() {
        val plan = send((1..ShareLimits.MAX_FILES + 1).map { file(it) })
        assertThat(plan.limits.trimCount).isEqualTo(1)
        assertThat(plan.limits.files).isEqualTo(ShareLimits.MAX_FILES + 1)
        assertThat(plan.canSend).isFalse()
    }

    @Test
    fun `ten media still publish and eleven withhold`() {
        val ten = SharePlanner.plan(ShareEntry.Media((1..10).map { image(it) }))
        assertThat(ten.offers(ShareAction.PUBLISH_POST)).isTrue()
        val eleven = SharePlanner.plan(ShareEntry.Media((1..11).map { image(it) }))
        assertThat(eleven.offers(ShareAction.PUBLISH_POST)).isFalse()
        assertThat(eleven.offers(ShareAction.PUBLISH_STORY)).isFalse()
        assertThat(eleven.offers(ShareAction.STUDIO)).isFalse()
        assertThat(eleven.withheldReason(ShareAction.STUDIO)).isEqualTo(ShareWithheldReason.TOO_MANY_FOR_PUBLICATION)
        assertThat(eleven.offers(ShareAction.SEND)).isTrue()
    }

    @Test
    fun `two pieces default to together and a lone piece has no grouping`() {
        assertThat(SharePlanner.plan(ShareEntry.Media(listOf(image(1), image(2)))).grouping).isEqualTo(ShareGrouping.TOGETHER)
        assertThat(SharePlanner.plan(ShareEntry.Media(listOf(image(1)))).grouping).isNull()
    }

    @Test
    fun `the caption keeps the shared ceiling and kept preserves the order of the media`() {
        val plan = SharePlanner.plan(ShareEntry.Media(listOf(image(3), image(1), image(2))))
        assertThat(plan.caption?.maxLength).isEqualTo(ShareLimits.MAX_CAPTION_LENGTH)
        assertThat(plan.kept).containsExactly("i3", "i1", "i2").inOrder()
    }

    @Test
    fun `media without id are kept by index`() {
        val plan = SharePlanner.plan(ShareEntry.Media(listOf(ShareMedia(mimeType = "image/png"), ShareMedia(mimeType = "image/png"))))
        assertThat(plan.kept).containsExactly("0", "1").inOrder()
    }
}
