package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PublicationRuptureTest {

    private fun rupture(vararg fates: MediaFate, failed: Boolean = true, offline: Boolean = false) =
        PublicationRupture.of(fates.toList(), failed = failed, offline = offline)

    @Test
    fun `nothing missing and still on its way needs no gesture`() {
        val r = rupture(MediaFate.UPLOADED, MediaFate.WAITING, failed = false)

        assertThat(r.gesture).isEqualTo(RuptureGesture.NONE)
        assertThat(r.missing).isEqualTo(0)
        assertThat(r.intact).isEqualTo(2)
    }

    @Test
    fun `a media whose bytes are gone is named missing and the only useful gesture is to replace it`() {
        val r = rupture(MediaFate.UPLOADED, MediaFate.LOST, MediaFate.UPLOADED)

        assertThat(r.missing).isEqualTo(1)
        assertThat(r.intact).isEqualTo(2)
        assertThat(r.gesture).isEqualTo(RuptureGesture.REPLACE_MISSING)
    }

    @Test
    fun `a lost media wins over a connection that is also down`() {
        val r = rupture(MediaFate.LOST, MediaFate.WAITING, offline = true)

        assertThat(r.gesture).isEqualTo(RuptureGesture.REPLACE_MISSING)
    }

    @Test
    fun `a failed publication with everything intact is retried`() {
        val r = rupture(MediaFate.UPLOADED, MediaFate.REFUSED)

        assertThat(r.gesture).isEqualTo(RuptureGesture.RETRY)
        assertThat(r.missing).isEqualTo(0)
    }

    @Test
    fun `a refused media is not lost its bytes are still on the device`() {
        val r = rupture(MediaFate.REFUSED)

        assertThat(r.intact).isEqualTo(1)
        assertThat(r.gesture).isEqualTo(RuptureGesture.RETRY)
    }

    @Test
    fun `offline and not failed means wait for the network`() {
        val r = rupture(MediaFate.WAITING, failed = false, offline = true)

        assertThat(r.gesture).isEqualTo(RuptureGesture.WAIT_FOR_NETWORK)
    }

    @Test
    fun `a failed publication offline waits for the network instead of a retry that cannot succeed`() {
        val r = rupture(MediaFate.WAITING, offline = true)

        assertThat(r.gesture).isEqualTo(RuptureGesture.WAIT_FOR_NETWORK)
    }

    @Test
    fun `a publication without media that failed is simply retried`() {
        val r = rupture()

        assertThat(r.gesture).isEqualTo(RuptureGesture.RETRY)
        assertThat(r.intact).isEqualTo(0)
    }

    @Test
    fun `a media refused for its location is missing and replaced, never retried into the same refusal`() {
        val r = rupture(MediaFate.UPLOADED, MediaFate.LOCATION_REFUSED)

        assertThat(r.missing).isEqualTo(1)
        assertThat(r.intact).isEqualTo(1)
        assertThat(r.gesture).isEqualTo(RuptureGesture.REPLACE_MISSING)
    }
}
