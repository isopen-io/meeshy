package me.meeshy.sdk.model.playback

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Port de `PlaybackDuckLedgerTests` (iOS, #11042) : le son Meeshy BAISSE pendant un
 * enregistrement, sans s'arreter, et remonte EXACTEMENT au volume qu'il avait.
 */
class PlaybackDuckLedgerTest {

    private fun ledger() = PlaybackDuckLedger<String>()

    @Test
    fun `le facteur de baisse garde le son audible`() {
        assertThat(PlaybackDuckLedger.DUCKED_FACTOR).isEqualTo(0.3f)
    }

    @Test
    fun `duck baisse le volume du facteur`() {
        val ledger = ledger()

        val applied = ledger.duck("player", currentVolume = 0.8f)

        assertThat(applied).isEqualTo(0.8f * PlaybackDuckLedger.DUCKED_FACTOR)
        assertThat(ledger.isEmpty).isFalse()
    }

    @Test
    fun `restore rend exactement le volume memorise`() {
        val ledger = ledger()
        val applied = ledger.duck("player", currentVolume = 0.8f)!!

        assertThat(ledger.restore("player", currentVolume = applied)).isEqualTo(0.8f)
        assertThat(ledger.isEmpty).isTrue()
    }

    @Test
    fun `baisser deux fois ne baisse qu'une fois et la restauration rend l'original`() {
        val ledger = ledger()
        val applied = ledger.duck("player", currentVolume = 1f)!!

        assertThat(ledger.duck("player", currentVolume = applied)).isNull()
        assertThat(ledger.restore("player", currentVolume = applied)).isEqualTo(1f)
    }

    @Test
    fun `rendre sans avoir baisse ne fait rien`() {
        val ledger = ledger()

        assertThat(ledger.restore("player", currentVolume = 0.4f)).isNull()
    }

    @Test
    fun `un volume que l'utilisateur a change pendant l'enregistrement est conserve`() {
        val ledger = ledger()
        ledger.duck("player", currentVolume = 1f)!!

        assertThat(ledger.restore("player", currentVolume = 0f)).isNull()
        assertThat(ledger.isEmpty).isTrue()
    }

    @Test
    fun `un volume remonte par l'utilisateur est lui aussi conserve`() {
        val ledger = ledger()
        ledger.duck("player", currentVolume = 0.5f)!!

        assertThat(ledger.restore("player", currentVolume = 0.9f)).isNull()
    }

    @Test
    fun `un volume relu a la tolerance pres est celui qu'on a ecrit`() {
        val ledger = ledger()
        val applied = ledger.duck("player", currentVolume = 1f)!!

        assertThat(ledger.restore("player", currentVolume = applied + 0.0004f)).isEqualTo(1f)
    }

    @Test
    fun `un lecteur silencieux n'est pas baisse`() {
        val ledger = ledger()

        assertThat(ledger.duck("player", currentVolume = 0f)).isNull()
        assertThat(ledger.isEmpty).isTrue()
    }

    @Test
    fun `un lecteur coupe n'est pas baisse et n'est donc jamais rendu audible`() {
        val ledger = ledger()

        val applied = ledger.duck("player", PlayerOutputState(isMuted = true, volume = 0.8f))

        assertThat(applied).isNull()
        assertThat(ledger.isEmpty).isTrue()
        assertThat(ledger.restore("player", currentVolume = 0.8f)).isNull()
    }

    @Test
    fun `un lecteur audible est baisse par la variante d'etat de sortie`() {
        val ledger = ledger()

        val applied = ledger.duck("player", PlayerOutputState(isMuted = false, volume = 0.5f))

        assertThat(applied).isEqualTo(0.5f * PlaybackDuckLedger.DUCKED_FACTOR)
    }

    @Test
    fun `restaurer deux fois ne restaure qu'une fois`() {
        val ledger = ledger()
        val applied = ledger.duck("player", currentVolume = 1f)!!

        assertThat(ledger.restore("player", currentVolume = applied)).isEqualTo(1f)
        assertThat(ledger.restore("player", currentVolume = 1f)).isNull()
    }

    @Test
    fun `forget oublie un lecteur qui n'existe plus`() {
        val ledger = ledger()
        ledger.duck("player", currentVolume = 1f)!!

        ledger.forget("player")

        assertThat(ledger.isEmpty).isTrue()
    }

    @Test
    fun `chaque lecteur garde son propre volume d'origine`() {
        val ledger = ledger()
        val voice = ledger.duck("voice", currentVolume = 1f)!!
        val reel = ledger.duck("reel", currentVolume = 0.5f)!!

        assertThat(ledger.restore("reel", currentVolume = reel)).isEqualTo(0.5f)
        assertThat(ledger.restore("voice", currentVolume = voice)).isEqualTo(1f)
        assertThat(ledger.isEmpty).isTrue()
    }

    @Test
    fun `une nouvelle baisse apres restauration repart du volume courant`() {
        val ledger = ledger()
        val first = ledger.duck("player", currentVolume = 1f)!!
        ledger.restore("player", currentVolume = first)

        val second = ledger.duck("player", currentVolume = 0.6f)

        assertThat(second).isEqualTo(0.6f * PlaybackDuckLedger.DUCKED_FACTOR)
    }
}
