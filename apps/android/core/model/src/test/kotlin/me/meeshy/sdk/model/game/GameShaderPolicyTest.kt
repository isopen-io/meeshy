package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameShaderPolicyTest {

    @Test
    fun `sous l API 33 le chemin est le degrade`() {
        listOf(26, 31, 32).forEach {
            assertThat(GameShaderPolicy.path(sdkInt = it, reduceMotion = false)).isEqualTo(GameShaderPath.GRADIENT)
        }
    }

    @Test
    fun `des l API 33 le chemin est AGSL`() {
        listOf(33, 34, 36).forEach {
            assertThat(GameShaderPolicy.path(sdkInt = it, reduceMotion = false)).isEqualTo(GameShaderPath.AGSL)
        }
    }

    @Test
    fun `animations reduites le repli statique vaut sur toutes les API`() {
        listOf(26, 32, 33, 36).forEach {
            assertThat(GameShaderPolicy.path(sdkInt = it, reduceMotion = true)).isEqualTo(GameShaderPath.GRADIENT)
        }
    }

    @Test
    fun `le reflet ne joue que dans son temps`() {
        assertThat(GameShaderPolicy.sheenPlays(0.0, 0.9, false)).isFalse()
        assertThat(GameShaderPolicy.sheenPlays(1.0, 0.9, false)).isFalse()
        assertThat(GameShaderPolicy.sheenPlays(-0.2, 0.9, false)).isFalse()
        assertThat(GameShaderPolicy.sheenPlays(0.5, 0.9, false)).isTrue()
    }

    @Test
    fun `le reflet sans intensite ou en mouvement reduit ne joue pas`() {
        assertThat(GameShaderPolicy.sheenPlays(0.5, 0.0, false)).isFalse()
        assertThat(GameShaderPolicy.sheenPlays(0.5, 0.9, true)).isFalse()
    }

    @Test
    fun `l onde suit les memes bornes et exige une amplitude`() {
        assertThat(GameShaderPolicy.wavePlays(0.0, 5f, false)).isFalse()
        assertThat(GameShaderPolicy.wavePlays(1.0, 5f, false)).isFalse()
        assertThat(GameShaderPolicy.wavePlays(0.5, 0f, false)).isFalse()
        assertThat(GameShaderPolicy.wavePlays(0.5, 5f, true)).isFalse()
        assertThat(GameShaderPolicy.wavePlays(0.5, 5f, false)).isTrue()
    }

    @Test
    fun `l irisation reste posee sous mouvement reduit mais fige`() {
        assertThat(GameShaderPolicy.iridescencePlays(0.6)).isTrue()
        assertThat(GameShaderPolicy.iridescencePlays(0.0)).isFalse()
        assertThat(GameShaderPolicy.iridescenceTilt(0.4, reduceMotion = true)).isEqualTo(0.25)
        assertThat(GameShaderPolicy.iridescenceTilt(0.4, reduceMotion = false)).isEqualTo(0.4)
    }

    @Test
    fun `le reflet s arrete apres trois passages`() {
        assertThat(GameShaderPolicy.sheenMayReplay(passesPlayed = 2)).isTrue()
        assertThat(GameShaderPolicy.sheenMayReplay(passesPlayed = 3)).isFalse()
    }
}
