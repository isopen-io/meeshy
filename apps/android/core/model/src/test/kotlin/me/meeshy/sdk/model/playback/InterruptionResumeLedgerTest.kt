package me.meeshy.sdk.model.playback

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.playback.InterruptionResumeLedger.Action
import me.meeshy.sdk.model.playback.InterruptionResumeLedger.Signal
import org.junit.Test

/**
 * Port de `InterruptionResumeLedgerTests` (iOS, #11040) : une interruption met Meeshy en pause,
 * et il reprend a la fin ce qui jouait, et seulement cela.
 */
class InterruptionResumeLedgerTest {

    private fun interruptedWhilePlaying(): InterruptionResumeLedger =
        InterruptionResumeLedger().also { it.handle(Signal.InterruptionBegan(isPlaying = true)) }

    // MARK: - Debut d'interruption

    @Test
    fun `une interruption pendant la lecture met en pause et garde la lecture interrompue`() {
        val ledger = InterruptionResumeLedger()

        assertThat(ledger.handle(Signal.InterruptionBegan(isPlaying = true))).isEqualTo(Action.Pause)
        assertThat(ledger.holdsInterruptedPlayback).isTrue()
    }

    @Test
    fun `une interruption pendant une pause ne fait rien et ne reprendra rien`() {
        val ledger = InterruptionResumeLedger()

        assertThat(ledger.handle(Signal.InterruptionBegan(isPlaying = false))).isEqualTo(Action.None)
        assertThat(ledger.handle(Signal.InterruptionEnded(shouldResume = true))).isEqualTo(Action.None)
        assertThat(ledger.holdsInterruptedPlayback).isFalse()
    }

    // MARK: - Fin d'interruption

    @Test
    fun `la fin de l'interruption avec reprise possible reprend ce qui jouait`() {
        val ledger = interruptedWhilePlaying()

        assertThat(ledger.handle(Signal.InterruptionEnded(shouldResume = true))).isEqualTo(Action.Resume)
        assertThat(ledger.holdsInterruptedPlayback).isFalse()
    }

    @Test
    fun `la fin sans reprise possible ne reprend rien, et une seconde fin non plus`() {
        val ledger = interruptedWhilePlaying()

        assertThat(ledger.handle(Signal.InterruptionEnded(shouldResume = false))).isEqualTo(Action.None)
        assertThat(ledger.handle(Signal.InterruptionEnded(shouldResume = true))).isEqualTo(Action.None)
    }

    @Test
    fun `une fin d'interruption n'est consommee qu'une fois`() {
        val ledger = interruptedWhilePlaying()

        assertThat(ledger.handle(Signal.InterruptionEnded(shouldResume = true))).isEqualTo(Action.Resume)
        assertThat(ledger.handle(Signal.InterruptionEnded(shouldResume = true))).isEqualTo(Action.None)
    }

    // MARK: - Decisions de l'utilisateur

    @Test
    fun `une pause de l'utilisateur pendant l'interruption l'emporte sur la reprise`() {
        val ledger = interruptedWhilePlaying()

        ledger.handle(Signal.UserPaused)

        assertThat(ledger.handle(Signal.InterruptionEnded(shouldResume = true))).isEqualTo(Action.None)
        assertThat(ledger.holdsInterruptedPlayback).isFalse()
    }

    @Test
    fun `une pause de l'utilisateur sans interruption ne declenche rien`() {
        val ledger = InterruptionResumeLedger()

        assertThat(ledger.handle(Signal.UserPaused)).isEqualTo(Action.None)
        assertThat(ledger.handle(Signal.InterruptionEnded(shouldResume = true))).isEqualTo(Action.None)
    }

    @Test
    fun `une relance de l'utilisateur pendant l'interruption ne laisse rien a reprendre`() {
        val ledger = interruptedWhilePlaying()

        ledger.handle(Signal.UserStartedPlayback)

        assertThat(ledger.handle(Signal.InterruptionEnded(shouldResume = true))).isEqualTo(Action.None)
    }

    @Test
    fun `un contenu libere pendant l'interruption n'est pas repris`() {
        val ledger = interruptedWhilePlaying()

        ledger.handle(Signal.ContentReleased)

        assertThat(ledger.handle(Signal.InterruptionEnded(shouldResume = true))).isEqualTo(Action.None)
    }

    @Test
    fun `une pause de l'utilisateur ne se confond pas avec une lecture interrompue d'une interruption suivante`() {
        val ledger = interruptedWhilePlaying()
        ledger.handle(Signal.UserPaused)
        ledger.handle(Signal.InterruptionEnded(shouldResume = true))

        assertThat(ledger.handle(Signal.InterruptionBegan(isPlaying = false))).isEqualTo(Action.None)
        assertThat(ledger.handle(Signal.InterruptionEnded(shouldResume = true))).isEqualTo(Action.None)
    }

    // MARK: - Sortie audio

    @Test
    fun `un casque debranche met en pause et desarme la reprise`() {
        val ledger = interruptedWhilePlaying()

        assertThat(ledger.handle(Signal.OutputLost)).isEqualTo(Action.Pause)
        assertThat(ledger.handle(Signal.InterruptionEnded(shouldResume = true))).isEqualTo(Action.None)
    }

    @Test
    fun `un casque debranche en pleine lecture sans interruption met en pause sans rien retenir`() {
        val ledger = InterruptionResumeLedger()

        assertThat(ledger.handle(Signal.OutputLost)).isEqualTo(Action.Pause)
        assertThat(ledger.holdsInterruptedPlayback).isFalse()
    }

    // MARK: - Appel Meeshy raccroche

    @Test
    fun `un appel Meeshy raccroche reprend comme une interruption systeme`() {
        val ledger = interruptedWhilePlaying()
        val signal = InterruptionResumeLedger.signalFor(MediaSessionEvent.CallEndedShouldResume, isPlaying = false)

        assertThat(signal).isNotNull()
        assertThat(ledger.handle(signal!!)).isEqualTo(Action.Resume)
    }

    // MARK: - Retour au premier plan

    @Test
    fun `revenir dans l'app une fois l'autre son arrete reprend`() {
        val ledger = interruptedWhilePlaying()

        val action = ledger.handle(
            Signal.ReturnedToForeground(otherAudioPlaying = false, contentStillOnScreen = true),
        )

        assertThat(action).isEqualTo(Action.Resume)
    }

    @Test
    fun `revenir dans l'app pendant que l'autre son joue encore attend la vraie fin`() {
        val ledger = interruptedWhilePlaying()

        val action = ledger.handle(
            Signal.ReturnedToForeground(otherAudioPlaying = true, contentStillOnScreen = true),
        )

        assertThat(action).isEqualTo(Action.None)
        assertThat(ledger.handle(Signal.InterruptionEnded(shouldResume = true))).isEqualTo(Action.Resume)
    }

    @Test
    fun `revenir dans l'app apres que le contenu a quitte l'ecran ne reprend rien`() {
        val ledger = interruptedWhilePlaying()

        val action = ledger.handle(
            Signal.ReturnedToForeground(otherAudioPlaying = false, contentStillOnScreen = false),
        )

        assertThat(action).isEqualTo(Action.None)
        assertThat(ledger.holdsInterruptedPlayback).isFalse()
    }

    @Test
    fun `revenir dans l'app sans interruption ne reprend rien`() {
        val ledger = InterruptionResumeLedger()

        val action = ledger.handle(
            Signal.ReturnedToForeground(otherAudioPlaying = false, contentStillOnScreen = true),
        )

        assertThat(action).isEqualTo(Action.None)
    }

    // MARK: - Evenements de session

    @Test
    fun `les evenements de session se traduisent en signaux`() {
        assertThat(InterruptionResumeLedger.signalFor(MediaSessionEvent.InterruptionBegan, isPlaying = true))
            .isEqualTo(Signal.InterruptionBegan(isPlaying = true))
        assertThat(InterruptionResumeLedger.signalFor(MediaSessionEvent.InterruptionEndedShouldResume, false))
            .isEqualTo(Signal.InterruptionEnded(shouldResume = true))
        assertThat(InterruptionResumeLedger.signalFor(MediaSessionEvent.CallEndedShouldResume, false))
            .isEqualTo(Signal.InterruptionEnded(shouldResume = true))
        assertThat(InterruptionResumeLedger.signalFor(MediaSessionEvent.InterruptionEndedShouldNotResume, false))
            .isEqualTo(Signal.InterruptionEnded(shouldResume = false))
        assertThat(InterruptionResumeLedger.signalFor(MediaSessionEvent.RouteChangedOldDeviceUnavailable, true))
            .isEqualTo(Signal.OutputLost)
        assertThat(InterruptionResumeLedger.signalFor(MediaSessionEvent.RouteChangedOther, true)).isNull()
    }

    @Test
    fun `une sequence complete d'appel reprend exactement une fois`() {
        val ledger = InterruptionResumeLedger()
        val actions = listOf(
            MediaSessionEvent.InterruptionBegan,
            MediaSessionEvent.InterruptionEndedShouldResume,
            MediaSessionEvent.InterruptionEndedShouldResume,
        ).mapNotNull { event ->
            InterruptionResumeLedger.signalFor(event, isPlaying = true)?.let(ledger::handle)
        }

        assertThat(actions).containsExactly(Action.Pause, Action.Resume, Action.None).inOrder()
    }
}
