package me.meeshy.sdk.model.waveform

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class RecordingTakePolicyTest {

    @Test
    fun `une prise sous 0,5 s est ecartee`() {
        assertThat(RecordingTakePolicy.keeps(0.49, AudioRecordingSettings.standard)).isFalse()
        assertThat(RecordingTakePolicy.keeps(0.0, AudioRecordingSettings.standard)).isFalse()
    }

    @Test
    fun `une prise de 0,5 s est gardee`() {
        assertThat(RecordingTakePolicy.keeps(0.5, AudioRecordingSettings.standard)).isTrue()
    }

    @Test
    fun `aucun plafond de duree`() {
        assertThat(RecordingTakePolicy.keeps(4 * 3600.0, AudioRecordingSettings.standard)).isTrue()
    }

    @Test
    fun `l'echantillon vocal ecarte une prise de neuf secondes`() {
        assertThat(RecordingTakePolicy.keeps(9.9, AudioRecordingSettings.voiceSample)).isFalse()
        assertThat(RecordingTakePolicy.keeps(10.0, AudioRecordingSettings.voiceSample)).isTrue()
    }
}
