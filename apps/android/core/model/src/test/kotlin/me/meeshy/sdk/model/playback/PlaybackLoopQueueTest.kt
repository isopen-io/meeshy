package me.meeshy.sdk.model.playback

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PlaybackLoopQueueTest {
    @Test
    fun `un successeur du meme media est insere derriere l element en cours une seule fois`() {
        val first = PlaybackLoopQueue.withCurrentItem().queueSuccessor()
        assertThat(first.inserted).isTrue()
        assertThat(first.queued).isTrue()
        val second = first.queue.queueSuccessor()
        assertThat(second.inserted).isFalse()
        assertThat(second.queued).isTrue()
        assertThat(second.queue.itemCount).isEqualTo(2)
    }

    @Test
    fun `sans element en cours rien n est mis en file`() {
        val result = PlaybackLoopQueue().queueSuccessor()
        assertThat(result.queued).isFalse()
        assertThat(result.inserted).isFalse()
    }

    @Test
    fun `la file n enchaine seule que boucle active et successeur present`() {
        val queued = PlaybackLoopQueue.withCurrentItem().queueSuccessor().queue
        assertThat(queued.advancesToQueuedSuccessor(loopActive = true)).isTrue()
        assertThat(queued.advancesToQueuedSuccessor(loopActive = false)).isFalse()
        assertThat(PlaybackLoopQueue.withCurrentItem().advancesToQueuedSuccessor(true)).isFalse()
    }

    @Test
    fun `apres l enchainement le successeur est l element en cours et la file est vide derriere`() {
        val advanced = PlaybackLoopQueue.withCurrentItem().queueSuccessor().queue.advanced()
        assertThat(advanced.itemCount).isEqualTo(1)
        assertThat(advanced.hasSuccessor).isFalse()
        assertThat(advanced.queueSuccessor().inserted).isTrue()
    }

    @Test
    fun `retirer les successeurs garde l element en cours`() {
        val dropped = PlaybackLoopQueue.withCurrentItem().queueSuccessor().queue.dropSuccessors()
        assertThat(dropped.itemCount).isEqualTo(1)
    }

    @Test
    fun `progression egale temps de l element sur duree et duree conservee au tour de boucle`() {
        assertThat(PlaybackProgressLaw.fraction(5.0, 20.0)).isEqualTo(0.25)
        assertThat(PlaybackProgressLaw.fraction(5.0, 0.0)).isEqualTo(0.0)
        assertThat(PlaybackProgressLaw.fraction(30.0, 20.0)).isEqualTo(1.0)
        assertThat(PlaybackProgressLaw.fraction(0.0, 20.0)).isEqualTo(0.0)
        assertThat(PlaybackProgressLaw.heldDuration(0.0, 12.0, isLoopSuccessor = true)).isEqualTo(12.0)
        assertThat(PlaybackProgressLaw.heldDuration(0.0, 12.0, isLoopSuccessor = false)).isEqualTo(0.0)
        assertThat(PlaybackProgressLaw.heldDuration(9.0, 12.0, isLoopSuccessor = true)).isEqualTo(9.0)
    }

    @Test
    fun `la tete publiee a la cible d un seek est bornee au media`() {
        assertThat(PlaybackProgressLaw.headAfterSeek(8.0, 20.0)).isEqualTo(8.0)
        assertThat(PlaybackProgressLaw.headAfterSeek(-3.0, 20.0)).isEqualTo(0.0)
        assertThat(PlaybackProgressLaw.headAfterSeek(99.0, 20.0)).isEqualTo(20.0)
        assertThat(PlaybackProgressLaw.headAfterSeek(99.0, 0.0)).isEqualTo(99.0)
        assertThat(PlaybackProgressLaw.headAfterSeek(Double.NaN, 20.0)).isEqualTo(0.0)
    }

    @Test
    fun `la fin d un element de boucle se decide en trois cas`() {
        assertThat(PlaybackLoopTurn.action(finishedIsCurrent = false, successorQueued = true))
            .isEqualTo(PlaybackLoopTurn.Action.ALREADY_ADVANCED)
        assertThat(PlaybackLoopTurn.action(finishedIsCurrent = true, successorQueued = true))
            .isEqualTo(PlaybackLoopTurn.Action.AWAIT_QUEUE_ADVANCE)
        assertThat(PlaybackLoopTurn.action(finishedIsCurrent = true, successorQueued = false))
            .isEqualTo(PlaybackLoopTurn.Action.REWIND_CURRENT_ITEM)
    }
}
