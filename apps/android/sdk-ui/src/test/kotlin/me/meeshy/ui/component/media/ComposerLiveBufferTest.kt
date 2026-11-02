package me.meeshy.ui.component.media

import androidx.media3.common.C
import androidx.media3.common.Timeline
import androidx.media3.exoplayer.LoadControl
import androidx.media3.exoplayer.analytics.PlayerId
import androidx.media3.exoplayer.source.MediaSource
import androidx.media3.exoplayer.upstream.Allocation
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * **L'aperçu vivant tient une empreinte bornée** (#13897, recette S8 du 2026-11-01 à 0 h 51) : avec le compositeur ouvert
 * sur un fond vidéo de 8,2 s et une vidéo posée de 15,6 s, le tas Java pesait 244 Mo sur 256 — dont 220,7 Mo de tampons de
 * 64 Kio des lecteurs vivants, qui chargeaient chacun jusqu'à 50 s de source (131 Mo permis par piste vidéo). L'export
 * démarrait sur ce tas et mourait en OutOfMemoryError à la seconde suivante. Joué sous Android 9, comme le S8.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
class ComposerLiveBufferTest {

    private val player = PlayerId("composer-live")

    private fun parameters(bufferedMillis: Long, rebuffering: Boolean = false) = LoadControl.Parameters(
        player,
        Timeline.EMPTY,
        MediaSource.MediaPeriodId(Any()),
        0L,
        bufferedMillis * MICROS_PER_MILLI,
        1f,
        true,
        rebuffering,
        C.TIME_UNSET,
    )

    /** Ce qu'un lecteur retient avant de cesser de charger, la tête à [bufferedMillis] d'avance (borné par [ceiling] tampons). */
    private fun heldBytes(control: LoadControl, bufferedMillis: Long, ceiling: Int = 400): Long {
        val held = mutableListOf<Allocation>()
        while (held.size < ceiling && control.shouldContinueLoading(parameters(bufferedMillis))) held += control.allocator.allocate()
        val bytes = held.sumOf { it.data.size.toLong() }
        held.forEach(control.allocator::release)
        return bytes
    }

    @Test
    fun a_live_player_stops_loading_at_its_byte_budget_even_when_its_buffer_is_short_in_time() {
        val control = ComposerLiveBuffer.loadControl()
        control.onPrepared(player)

        val held = heldBytes(control, bufferedMillis = 300)

        assertThat(held).isAtMost(ComposerLiveBuffer.MAX_BYTES.toLong())
        assertThat(held).isAtLeast(ComposerLiveBuffer.MAX_BYTES.toLong() / 2)
    }

    @Test
    fun a_live_player_stops_loading_once_it_holds_a_few_seconds_ahead() {
        val control = ComposerLiveBuffer.loadControl()
        control.onPrepared(player)

        assertThat(control.shouldContinueLoading(parameters(bufferedMillis = ComposerLiveBuffer.MAX_AHEAD_MILLIS.toLong()))).isFalse()
    }

    @Test
    fun a_live_player_starts_playing_on_a_short_buffer() {
        val control = ComposerLiveBuffer.loadControl()
        control.onPrepared(player)

        assertThat(control.shouldStartPlayback(parameters(bufferedMillis = 600))).isTrue()
    }

    private companion object {
        const val MICROS_PER_MILLI = 1_000L
    }
}
