package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryMediaObject
import org.junit.Test

class StoryVolumeCarryingTest {
    @Test fun `bascule puis retour restaure le memento puis l'efface`() {
        val muted = StoryMediaObject(id = "m", volume = 0.4f).toggledMute()
        assertThat(muted.volume).isEqualTo(0f)
        assertThat(muted.mutedVolumeMemento).isEqualTo(0.4f)
        val back = muted.toggledMute()
        assertThat(back.volume).isEqualTo(0.4f)
        assertThat(back.mutedVolumeMemento).isNull()
    }

    @Test fun `le dernier recours est 1,0 et un reglage manuel efface le memento`() {
        assertThat(StoryAudioPlayerObject("a", volume = 0f).toggledMute().volume).isEqualTo(1f)
        val manual = StoryMediaObject(id = "m", volume = 0f, mutedVolumeMemento = 0.4f).withVolumePreservingMuteMemento(0.9f)
        assertThat(manual.mutedVolumeMemento).isNull()
    }

    @Test fun `l'invariant memento non nul implique volume nul tient apres toute suite d'operations`() {
        var m = StoryMediaObject(id = "m", volume = 0.8f)
        listOf(0f, 0.3f, 0f, 0f).forEach {
            m = m.withVolumePreservingMuteMemento(it).toggledMute()
            if (m.mutedVolumeMemento != null) assertThat(m.volume).isEqualTo(0f)
        }
    }
}
