package me.meeshy.sdk.model.reading.summary

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PresenceState
import org.junit.Test

class LivingSummaryAssemblyTest {
    private fun assemble(
        messages: List<SummarySourceMessage>,
        complete: Boolean = true,
        presence: (String) -> PresenceState? = { null },
    ) = LivingSummaryAssembly.assemble(
        LivingSummaryInput(messages, "me", "meeshy", complete, UTC, jan(1, 23), presence),
    )

    @Test fun `un message protege reste compte mais son texte est vide avant tout calcul`() {
        val summary = assemble(
            listOf(source("m1", "bob", jan(1, 8), content = "@meeshy tu viens ?", protected = true)),
        )
        assertThat(summary.digest.messageCount).isEqualTo(1)
        assertThat(summary.digest.awaitingYou).isEmpty()
        assertThat(summary.faceRamp).isEmpty()
    }

    @Test fun `le meme texte non protege attend`() {
        val summary = assemble(listOf(source("m1", "bob", jan(1, 8), content = "@meeshy tu viens ?", name = "Bob")))
        assertThat(summary.digest.awaitingYou.map { it.kind })
            .containsExactly(AwaitingKind.MENTION, AwaitingKind.UNANSWERED_QUESTION)
        assertThat(summary.faceRamp.single().displayName).isEqualTo("Bob")
        assertThat(summary.faceRamp.single().awaitingCount).isEqualTo(1)
    }

    @Test fun `la mention est insensible a la casse`() {
        assertThat(LivingSummaryAssembly.mentionsViewer("Salut @MEESHY !", "meeshy")).isTrue()
        assertThat(LivingSummaryAssembly.mentionsViewer("Salut meeshy", "meeshy")).isFalse()
        assertThat(LivingSummaryAssembly.mentionsViewer("@x", null)).isFalse()
        assertThat(LivingSummaryAssembly.mentionsViewer("@x", "")).isFalse()
    }

    @Test fun `fenetre complete versus partielle est transmise`() {
        val messages = listOf(source("m1", "bob", jan(1, 8)))
        assertThat(assemble(messages, complete = true).digest.isComplete).isTrue()
        assertThat(assemble(messages, complete = false).digest.isComplete).isFalse()
    }

    @Test fun `les messages systeme ne comptent pas et la presence vient de l injection`() {
        val summary = assemble(
            listOf(source("s", "system", jan(1, 7), system = true), source("m1", "bob", jan(1, 8), content = "ok ?", name = "Bob")),
            presence = { if (it == "bob") PresenceState.ONLINE else null },
        )
        assertThat(summary.digest.messageCount).isEqualTo(1)
        assertThat(summary.faceRamp.single().presence).isEqualTo(PresenceState.ONLINE)
    }

    @Test fun `presence absente donne offline et couleur de repli`() {
        val summary = assemble(listOf(source("m1", "bob", jan(1, 8), content = "ok ?", username = "bobby")))
        val entry = summary.faceRamp.single()
        assertThat(entry.presence).isEqualTo(PresenceState.OFFLINE)
        assertThat(entry.colorHex).isEqualTo(LivingSummaryAssembly.FALLBACK_COLOR_HEX)
        assertThat(entry.displayName).isEqualTo("bobby")
    }

    @Test fun `les episodes du digest viennent de la segmentation`() {
        val summary = assemble((0..3).map { source("m$it", "bob", jan(1, 8, it)) })
        assertThat(summary.digest.episodes.single().messageIds).hasSize(4)
    }
}
