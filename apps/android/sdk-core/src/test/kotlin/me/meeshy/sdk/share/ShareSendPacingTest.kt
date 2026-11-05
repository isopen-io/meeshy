package me.meeshy.sdk.share

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.share.SharePendingShare
import org.junit.Test

class ShareSendPacingTest {

    private fun share(origin: Int?, vararg served: String) =
        SharePendingShare.make("s1", 0L, "u", "hi", emptyList(), listOf("c0", "c1", "c2"))
            .copy(originTargetIndex = origin)
            .let { served.fold(it) { acc, id -> acc.markSent(id, null) } }

    @Test
    fun `the origin is served first then the others in order`() {
        assertThat(ShareSendPacing.serveOrder(share(origin = 1))).containsExactly(1, 0, 2).inOrder()
    }

    @Test
    fun `a partial resume recomputes the same order without the served targets`() {
        assertThat(ShareSendPacing.serveOrder(share(origin = 1, "c1"))).containsExactly(0, 2).inOrder()
    }

    @Test
    fun `without media the first target leads`() {
        assertThat(ShareSendPacing.serveOrder(share(origin = null))).containsExactly(0, 1, 2).inOrder()
    }

    @Test
    fun `the backoff doubles and is capped`() {
        assertThat(ShareSendPacing.backoffMillis(0)).isEqualTo(30_000L)
        assertThat(ShareSendPacing.backoffMillis(1)).isEqualTo(60_000L)
        assertThat(ShareSendPacing.backoffMillis(30)).isEqualTo(ShareSendPacing.MAX_BACKOFF_MILLIS)
    }

    @Test
    fun `the work gives up at the ceiling of runs`() {
        assertThat(ShareSendPacing.shouldGiveUp(ShareSendPacing.MAX_WORK_RUNS - 1)).isFalse()
        assertThat(ShareSendPacing.shouldGiveUp(ShareSendPacing.MAX_WORK_RUNS)).isTrue()
    }

    @Test
    fun `a refusal at creation and one at completion have distinct reasons`() {
        assertThat(ShareSendPacing.verdict(401, ShareRefusalMoment.CREATION))
            .isEqualTo(ShareVerdict.Refused(ShareRefusalMoment.CREATION, ShareRefusalReason.SESSION_EXPIRED))
        assertThat(ShareSendPacing.verdict(413, ShareRefusalMoment.CREATION))
            .isEqualTo(ShareVerdict.Refused(ShareRefusalMoment.CREATION, ShareRefusalReason.TOO_LARGE))
        assertThat(ShareSendPacing.verdict(403, ShareRefusalMoment.COMPLETION))
            .isEqualTo(ShareVerdict.Refused(ShareRefusalMoment.COMPLETION, ShareRefusalReason.FORBIDDEN))
        assertThat(ShareSendPacing.verdict(422, ShareRefusalMoment.COMPLETION))
            .isEqualTo(ShareVerdict.Refused(ShareRefusalMoment.COMPLETION, ShareRefusalReason.NON_CONFORMING))
    }

    @Test
    fun `a status of the other moment or a transient one is never a refusal`() {
        assertThat(ShareSendPacing.verdict(403, ShareRefusalMoment.CREATION)).isEqualTo(ShareVerdict.Transient)
        assertThat(ShareSendPacing.verdict(401, ShareRefusalMoment.COMPLETION)).isEqualTo(ShareVerdict.Transient)
        assertThat(ShareSendPacing.verdict(503, ShareRefusalMoment.CREATION)).isEqualTo(ShareVerdict.Transient)
        assertThat(ShareSendPacing.verdict(null, ShareRefusalMoment.COMPLETION)).isEqualTo(ShareVerdict.Transient)
    }
}
