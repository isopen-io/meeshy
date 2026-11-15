package me.meeshy.sdk.story

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerReopenHandoffTest {
    private fun handoff(root: String = "r1") = ComposerReopenHandoff().also {
        it.rootAppeared(root)
        it.noteComposerTornDown("draft-1")
    }

    @Test
    fun `la racine montee rouvre le brouillon demonte, une seule fois`() {
        val handoff = handoff()
        assertThat(handoff.takeComposerToReopen(presentingComposer = false, root = "r1")).isEqualTo("draft-1")
        assertThat(handoff.takeComposerToReopen(presentingComposer = false, root = "r1")).isNull()
    }

    @Test
    fun `une racine qui presente deja le composeur ne le rouvre pas et garde l annonce`() {
        val handoff = handoff()
        assertThat(handoff.takeComposerToReopen(presentingComposer = true, root = "r1")).isNull()
        assertThat(handoff.takeComposerToReopen(presentingComposer = false, root = "r1")).isEqualTo("draft-1")
    }

    @Test
    fun `la racine sortante ne consomme pas le brouillon`() {
        val handoff = handoff()
        handoff.rootDisappeared("r1")
        assertThat(handoff.takeComposerToReopen(presentingComposer = false, root = "r1")).isNull()
        handoff.rootAppeared("r2")
        assertThat(handoff.takeComposerToReopen(presentingComposer = false, root = "r1")).isNull()
        assertThat(handoff.takeComposerToReopen(presentingComposer = false, root = "r2")).isEqualTo("draft-1")
    }

    @Test
    fun `revoir le composeur a l ecran annule l annonce`() {
        val handoff = handoff()
        handoff.composerAppeared()
        assertThat(handoff.takeComposerToReopen(presentingComposer = false, root = "r1")).isNull()
    }
}
