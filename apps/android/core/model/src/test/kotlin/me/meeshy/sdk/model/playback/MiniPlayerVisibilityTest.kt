package me.meeshy.sdk.model.playback

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MiniPlayerVisibilityTest {

    private fun subject(conversationId: String, attachmentId: String = "a-$conversationId") =
        MiniPlayerSubject(conversationId = conversationId, messageId = "m-$conversationId", attachmentId = attachmentId)

    private fun step(
        state: MiniPlayerVisibilityState = MiniPlayerVisibilityState(),
        active: MiniPlayerSubject? = null,
        grace: MiniPlayerSubject? = null,
        inConversation: String? = null,
        covered: Boolean = false,
    ): MiniPlayerVisibilityState = MiniPlayerVisibility.next(state, active, grace, inConversation, isCovered = covered)

    @Test fun `un vocal qui joue hors de toute conversation s'affiche`() {
        val c1 = subject("c1")
        assertThat(step(active = c1).shown).isEqualTo(c1)
    }

    @Test fun `la barre se masque dans la conversation qui joue`() {
        assertThat(step(active = subject("c1"), inConversation = "c1").shown).isNull()
    }

    @Test fun `la barre s'affiche dans une autre conversation que celle qui joue`() {
        val c1 = subject("c1")
        assertThat(step(active = c1, inConversation = "c2").shown).isEqualTo(c1)
    }

    @Test fun `sortir de la conversation qui joue fait revenir la barre`() {
        val c1 = subject("c1")
        val inside = step(active = c1, inConversation = "c1")
        assertThat(step(state = inside, active = c1, inConversation = null).shown).isEqualTo(c1)
    }

    @Test fun `fin de file barre a l'ecran la garde pendant la grace`() {
        val c1 = subject("c1")
        val playing = step(active = c1)
        val exhausted = step(state = playing, active = null, grace = c1)
        assertThat(exhausted.shown).isEqualTo(c1)
        assertThat(exhausted.graceArmed).isTrue()
    }

    @Test fun `la fin de la grace fait partir la barre`() {
        val c1 = subject("c1")
        val exhausted = step(state = step(active = c1), grace = c1)
        assertThat(step(state = exhausted, active = null, grace = null).shown).isNull()
    }

    @Test fun `la croix ferme sur le champ meme barre a l'ecran`() {
        val c1 = subject("c1")
        val playing = step(active = c1)
        assertThat(step(state = playing, active = null, grace = null).shown).isNull()
    }

    @Test fun `fin de file dans la conversation qui joue n'arme aucune grace`() {
        val c1 = subject("c1")
        val inside = step(active = c1, inConversation = "c1")
        val exhausted = step(state = inside, active = null, grace = c1, inConversation = "c1")
        assertThat(exhausted.shown).isNull()
        assertThat(exhausted.graceArmed).isFalse()
    }

    @Test fun `sortir de la conversation pendant une grace non armee ne montre rien`() {
        val c1 = subject("c1")
        val inside = step(active = c1, inConversation = "c1")
        val exhausted = step(state = inside, active = null, grace = c1, inConversation = "c1")
        assertThat(step(state = exhausted, active = null, grace = c1, inConversation = null).shown).isNull()
    }

    @Test fun `entrer dans la conversation pendant la grace masque la barre puis la rend en sortant`() {
        val c1 = subject("c1")
        val exhausted = step(state = step(active = c1), grace = c1)
        val inside = step(state = exhausted, grace = c1, inConversation = "c1")
        assertThat(inside.shown).isNull()
        assertThat(inside.graceArmed).isTrue()
        assertThat(step(state = inside, grace = c1, inConversation = null).shown).isEqualTo(c1)
    }

    @Test fun `la grace reste visible dans une autre conversation que celle qui jouait`() {
        val c1 = subject("c1")
        val exhausted = step(state = step(active = c1, inConversation = "c2"), grace = c1, inConversation = "c2")
        assertThat(exhausted.shown).isEqualTo(c1)
    }

    @Test fun `un nouveau vocal pendant la grace remplace le precedent et desarme la grace`() {
        val c1 = subject("c1")
        val c3 = subject("c3")
        val exhausted = step(state = step(active = c1), grace = c1)
        val replaced = step(state = exhausted, active = c3, grace = null)
        assertThat(replaced.shown).isEqualTo(c3)
        assertThat(replaced.graceArmed).isFalse()
    }

    @Test fun `le vocal suivant d'une meme file garde la barre`() {
        val first = subject("c1", attachmentId = "a1")
        val second = subject("c1", attachmentId = "a2")
        val playing = step(active = first)
        assertThat(step(state = playing, active = second).shown).isEqualTo(second)
    }

    @Test fun `un ecran qui couvre le chrome, comme l'appel, masque la barre qui revient ensuite`() {
        val c1 = subject("c1")
        val covered = step(active = c1, covered = true)
        assertThat(covered.shown).isNull()
        assertThat(step(state = covered, active = c1).shown).isEqualTo(c1)
    }

    @Test fun `la grace armee survit a un ecran qui couvre le chrome`() {
        val c1 = subject("c1")
        val exhausted = step(state = step(active = c1), grace = c1)
        val covered = step(state = exhausted, grace = c1, covered = true)
        assertThat(covered.shown).isNull()
        assertThat(covered.graceArmed).isTrue()
        assertThat(step(state = covered, grace = c1).shown).isEqualTo(c1)
    }

    @Test fun `la barre est la derniere barre sans pastille d'appel`() {
        assertThat(MiniPlayerVisibility.isLastBar(callPillShown = false)).isTrue()
        assertThat(MiniPlayerVisibility.isLastBar(callPillShown = true)).isFalse()
    }

    @Test fun `le transport suit le moteur quand il joue la piste du sujet`() {
        val playback = AudioPlaybackState(attachmentId = "a1", isPlaying = true, currentTimeMs = 2_500L, durationMs = 10_000L)
        val transport = MiniPlayerVisibility.transport(subjectAttachmentId = "a1", playback = playback)
        assertThat(transport.isPlaying).isTrue()
        assertThat(transport.progress).isWithin(1e-6f).of(0.25f)
    }

    @Test fun `le transport est au repos quand le moteur joue une autre piste`() {
        val postAudio = AudioPlaybackState(attachmentId = "post-audio", isPlaying = true, currentTimeMs = 9_000L, durationMs = 10_000L)
        val transport = MiniPlayerVisibility.transport(subjectAttachmentId = "a1", playback = postAudio)
        assertThat(transport).isEqualTo(MiniPlayerTransport(isPlaying = false, progress = 0f))
    }

    @Test fun `le transport est au repos sans sujet`() {
        val playback = AudioPlaybackState(attachmentId = "a1", isPlaying = true, currentTimeMs = 1_000L, durationMs = 10_000L)
        assertThat(MiniPlayerVisibility.transport(subjectAttachmentId = null, playback = playback).isPlaying).isFalse()
    }

    @Test fun `le pourcentage arrondit au plus proche et se borne`() {
        assertThat(MiniPlayerVisibility.percent(0.456)).isEqualTo(46)
        assertThat(MiniPlayerVisibility.percent(1.7)).isEqualTo(100)
        assertThat(MiniPlayerVisibility.percent(-1.0)).isEqualTo(0)
        assertThat(MiniPlayerVisibility.percent(Double.NaN)).isEqualTo(0)
    }
}
