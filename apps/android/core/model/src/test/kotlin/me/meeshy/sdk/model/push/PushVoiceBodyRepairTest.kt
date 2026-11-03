package me.meeshy.sdk.model.push

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PushVoiceBodyRepairTest {
    @Test
    fun `duree arrondie a la seconde et minutes formatees`() {
        assertThat(PushVoiceBodyRepair.repair(null, "audio/ogg; codecs=opus", 65_400, "Voice")).isEqualTo("Voice · 1:05")
    }

    @Test
    fun `sans duree le libelle seul`() {
        assertThat(PushVoiceBodyRepair.repair("", "audio/mp4", null, "Voice")).isEqualTo("Voice")
    }

    @Test
    fun `un corps non vide ou un mime non audio est laisse tel quel`() {
        assertThat(PushVoiceBodyRepair.repair("Salut", "audio/mp4", 1_000, "Voice")).isEqualTo("Salut")
        assertThat(PushVoiceBodyRepair.repair(null, "image/png", 1_000, "Voice")).isNull()
        assertThat(PushVoiceBodyRepair.repair(null, null, 1_000, "Voice")).isNull()
    }
}
