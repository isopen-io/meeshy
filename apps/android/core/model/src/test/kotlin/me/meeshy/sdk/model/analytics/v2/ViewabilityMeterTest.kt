package me.meeshy.sdk.model.analytics.v2

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ViewabilityMeterTest {

    private fun meter(isVideo: Boolean = false) = ViewabilityMeter(isVideo)

    @Test
    fun `une carte visible a 50 pour cent pendant 1000 ms est viewable`() {
        val m = meter().apply { note(0.5, atMs = 0) }
        assertThat(m.isViewable(999)).isFalse()
        assertThat(m.isViewable(1_000)).isTrue()
    }

    @Test
    fun `49 pour cent ne l'est jamais`() {
        val m = meter().apply { note(0.49, atMs = 0) }
        assertThat(m.isViewable(60_000)).isFalse()
        assertThat(m.maxVisibleFraction).isEqualTo(0.49)
    }

    @Test
    fun `une fraction qui retombe sous 50 pour cent remet le compteur continu a zero`() {
        val m = meter().apply {
            note(0.8, atMs = 0)
            note(0.3, atMs = 900)
            note(0.8, atMs = 1_000)
        }
        assertThat(m.isViewable(1_999)).isFalse()
        assertThat(m.isViewable(2_000)).isTrue()
    }

    @Test
    fun `une video en lecture exige 2000 ms et la meme carte non video 1000`() {
        val video = meter(isVideo = true).apply { note(1.0, atMs = 0) }
        val card = meter().apply { note(1.0, atMs = 0) }
        assertThat(video.isViewable(1_999)).isFalse()
        assertThat(video.isViewable(2_000)).isTrue()
        assertThat(card.isViewable(1_000)).isTrue()
    }

    @Test
    fun `une fois viewable elle le reste malgre la sortie de l'ecran`() {
        val m = meter().apply {
            note(0.9, atMs = 0)
            note(0.0, atMs = 1_500)
        }
        assertThat(m.isViewable(10_000)).isTrue()
    }

    @Test
    fun `une sortie a l'instant du seuil conclut viewable`() {
        val m = meter().apply {
            note(0.9, atMs = 0)
            note(0.0, atMs = 1_000)
        }
        assertThat(m.isViewable(1_000)).isTrue()
    }

    @Test
    fun `le temps visible cumule les relectures`() {
        val m = meter().apply {
            note(0.2, atMs = 100)
            note(0.0, atMs = 400)
            note(0.6, atMs = 1_000)
        }
        assertThat(m.visibleMs(1_500)).isEqualTo(800)
    }

    @Test
    fun `la mesure qualifie l'impression sans la conditionner`() {
        val m = meter().apply { note(0.3, atMs = 0) }
        val visibility = m.measure(atMs = 200, impressionEventId = "evt-1")
        assertThat(visibility.viewable).isFalse()
        assertThat(visibility.visibleMs).isEqualTo(200)
        assertThat(visibility.maxVisibleFraction).isEqualTo(0.3)
        assertThat(visibility.impressionEventId).isEqualTo("evt-1")
    }

    @Test
    fun `la fraction maximale s'arrondit a deux decimales`() {
        val m = meter().apply { note(0.5678, atMs = 0) }
        assertThat(m.maxVisibleFraction).isEqualTo(0.57)
    }
}
