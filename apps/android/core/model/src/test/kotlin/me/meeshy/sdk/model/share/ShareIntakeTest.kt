package me.meeshy.sdk.model.share

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

class ShareIntakeTest {
    private fun media(i: Int) = ShareStagedMedia("s/$i.jpg", "jpg", "image/jpeg", 10)

    @Test
    fun `media keep the provider order whatever the arrival order`() {
        val g = ShareIntake.gathered(listOf(
            ShareLoadOutcome.Staged(ShareStagingResult.success(1, media(1))),
            ShareLoadOutcome.Staged(ShareStagingResult.success(0, media(0))),
        ))
        assertThat(g.media.map { it.relPath }).containsExactly("s/0.jpg", "s/1.jpg").inOrder()
    }

    @Test
    fun `text and url compose without a duplicate`() {
        assertThat(ShareIntake.composeContent("Titre", "https://a.b")).isEqualTo("Titre\nhttps://a.b")
        assertThat(ShareIntake.composeContent("https://a.b", "https://a.b")).isEqualTo("https://a.b")
        assertThat(ShareIntake.composeContent("  ", null)).isNull()
    }

    @Test
    fun `every uncopied file is named, one reason per kind`() {
        val g = ShareIntake.gathered(listOf(
            ShareLoadOutcome.Staged(ShareStagingResult.success(0, media(0))),
            ShareLoadOutcome.Staged(ShareStagingResult.failure(1, ShareStagingError.ByteBudgetExceeded(5, 4))),
            ShareLoadOutcome.Staged(ShareStagingResult.failure(2, ShareStagingError.FileCountExceeded(21, 20))),
            ShareLoadOutcome.Staged(ShareStagingResult.failure(3, ShareStagingError.RefusedSource)),
            ShareLoadOutcome.Staged(ShareStagingResult.failure(4, ShareStagingError.CopyFailed("x"))),
        ))
        assertThat(g.media).hasSize(1)
        assertThat(g.shortfalls).containsExactly(
            ShareShortfall.RefusedSource, ShareShortfall.OverBudget(2), ShareShortfall.Unprepared,
        ).inOrder()
    }

    @Test
    fun `cancel erases only without a send attempted nor a pending record`() {
        assertThat(ShareCancelPolicy.mayDiscardStagedMedia(false, false)).isTrue()
        assertThat(ShareCancelPolicy.mayDiscardStagedMedia(true, false)).isFalse()
        assertThat(ShareCancelPolicy.mayDiscardStagedMedia(false, true)).isFalse()
    }

    @Test
    fun `the completion gate fires exactly once under concurrency`() {
        val gate = ShareCompletionGate()
        val count = AtomicInteger()
        val pool = Executors.newFixedThreadPool(8)
        repeat(100) { pool.execute { gate.fireOnce { count.incrementAndGet() } } }
        pool.shutdown()
        pool.awaitTermination(5, java.util.concurrent.TimeUnit.SECONDS)
        assertThat(count.get()).isEqualTo(1)
        assertThat(gate.hasFired).isTrue()
    }

    @Test
    fun `the upload name falls back to the copy name`() {
        assertThat(media(3).uploadFileName).isEqualTo("3.jpg")
        assertThat(media(3).copy(originalName = "IMG_1.jpg").uploadFileName).isEqualTo("IMG_1.jpg")
    }
}
