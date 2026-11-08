package me.meeshy.sdk.model.waveform

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AudioProgressDisplayTest {
    @Test fun `la lecture en direct prime`() {
        val d = AudioProgressDisplay.of(0.4, 4.0, 0.9, 8.0, 10.0)
        assertThat(d).isEqualTo(AudioProgressDisplay(0.4, 4.0, true))
    }

    @Test fun `au repos la fraction consommee persistee est montree`() {
        val d = AudioProgressDisplay.of(0.0, 0.0, 0.5, null, 10.0)
        assertThat(d).isEqualTo(AudioProgressDisplay(0.5, 5.0, false))
        assertThat(AudioProgressDisplay.of(0.0, 0.0, 0.5, 7.0, 10.0).elapsedSeconds).isEqualTo(7.0)
        assertThat(AudioProgressDisplay.of(0.0, 0.0, 0.5, null, 0.0).elapsedSeconds).isEqualTo(0.0)
    }

    @Test fun `libelles d octets`() {
        assertThat(AudioByteLabels.needsDownload(0)).isEmpty()
        assertThat(AudioByteLabels.needsDownload(410 * 1024L)).isEqualTo("410 KB")
        assertThat(AudioByteLabels.downloading(410 * 1024L, 850 * 1024L, 0)).isEqualTo("410 KB / 850 KB")
        assertThat(AudioByteLabels.downloading(0, 0, 0)).isEmpty()
        assertThat(AudioByteLabels.downloading(100, 0, 0)).isEqualTo("100 B / ?")
    }
}
