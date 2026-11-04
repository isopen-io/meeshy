package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ScenePlayerModeRulesTest {

    @Test
    fun `tous les modes naissent en pause`() {
        ScenePlayerMode.values().forEach { assertThat(ScenePlayerConfig.of(it).startsPaused).isTrue() }
    }

    @Test
    fun `seule la carte du fil est muette et verrouillee`() {
        ScenePlayerMode.values().forEach {
            val config = ScenePlayerConfig.of(it)
            assertThat(config.isMuted).isEqualTo(it == ScenePlayerMode.CARD)
            assertThat(config.locksMute).isEqualTo(it == ScenePlayerMode.CARD)
        }
    }

    @Test
    fun `la carte et le reel bouclent le reader et l apercu jouent une fois`() {
        assertThat(ScenePlayerConfig.of(ScenePlayerMode.CARD).loops).isTrue()
        assertThat(ScenePlayerConfig.of(ScenePlayerMode.REEL).loops).isTrue()
        assertThat(ScenePlayerConfig.of(ScenePlayerMode.READER).loops).isFalse()
        assertThat(ScenePlayerConfig.of(ScenePlayerMode.PREVIEW).loops).isFalse()
    }

    @Test
    fun `le reel boucle avec le son et porte la chrome`() {
        val reel = ScenePlayerConfig.of(ScenePlayerMode.REEL)
        assertThat(reel.loops).isTrue()
        assertThat(reel.isMuted).isFalse()
        assertThat(reel.showsChrome).isTrue()
    }

    @Test
    fun `la chrome revient au reader et au reel`() {
        assertThat(ScenePlayerConfig.of(ScenePlayerMode.READER).showsChrome).isTrue()
        assertThat(ScenePlayerConfig.of(ScenePlayerMode.PREVIEW).showsChrome).isFalse()
        assertThat(ScenePlayerConfig.of(ScenePlayerMode.CARD).showsChrome).isFalse()
    }

    @Test
    fun `le muet verrouille ignore la demande de l hote`() {
        assertThat(ScenePlayerConfig.of(ScenePlayerMode.CARD).effectiveMute(requested = false)).isTrue()
    }

    @Test
    fun `un mode libre suit la demande de l hote ou son defaut`() {
        val detail = ScenePlayerConfig.of(ScenePlayerMode.PREVIEW)
        assertThat(detail.effectiveMute(requested = null)).isFalse()
        assertThat(detail.effectiveMute(requested = true)).isTrue()
    }
}
