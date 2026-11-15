package me.meeshy.sdk.model.metrics

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ExitReasonBucketTest {
    @Test fun `chaque raison est rangee dans son seau`() {
        val expected = mapOf(
            1 to ExitReasonBucket.Normal, 10 to ExitReasonBucket.Normal, 11 to ExitReasonBucket.Normal,
            4 to ExitReasonBucket.Crash, 5 to ExitReasonBucket.Crash, 7 to ExitReasonBucket.Crash,
            6 to ExitReasonBucket.AnrWatchdog, 3 to ExitReasonBucket.LowMemory,
            9 to ExitReasonBucket.ExcessiveResources,
            2 to ExitReasonBucket.Other, 13 to ExitReasonBucket.Other, 999 to ExitReasonBucket.Other,
        )
        expected.forEach { (reason, bucket) -> assertThat(ExitReasonBucket.classify(reason)).isEqualTo(bucket) }
    }

    @Test fun `les comptes ignorent la sortie normale dans les terminaisons`() {
        val counts = BackgroundExitCounts.fromReasons(listOf(1, 1, 4, 6, 3, 9, 13))
        assertThat(counts.normal).isEqualTo(2)
        assertThat(counts.terminations).isEqualTo(5)
        assertThat(counts.anrWatchdog).isEqualTo(1)
    }
}
