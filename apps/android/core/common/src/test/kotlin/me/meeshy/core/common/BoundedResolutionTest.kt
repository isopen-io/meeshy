package me.meeshy.core.common

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.currentTime
import kotlinx.coroutines.test.runTest
import org.junit.Test

class BoundedResolutionTest {
    @Test
    fun `rend la valeur arrivee avant l'echeance`() = runTest {
        assertThat(resolveBounded(1_000) { delay(10); "ok" }).isEqualTo("ok")
    }

    @Test
    fun `rend null a l'echeance et annule l'operation`() = runTest {
        var finished = false
        val result = resolveBounded<String>(1_000) { delay(5_000); finished = true; "late" }
        assertThat(result).isNull()
        assertThat(currentTime).isEqualTo(1_000L)
        assertThat(finished).isFalse()
    }
}
