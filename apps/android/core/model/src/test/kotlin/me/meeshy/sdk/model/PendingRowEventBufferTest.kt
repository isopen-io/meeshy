package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PendingRowEventBufferTest {

    private val t0 = 1_000_000L

    private fun message(block: (ApiMessage) -> ApiMessage = { it }) =
        block(ApiMessage(id = "m1", conversationId = "c", content = "avant"))

    @Test
    fun `un evenement echu apres cinq minutes n est jamais rejoue`() {
        val buffer = PendingRowEventBuffer()
        buffer.rememberTombstone("m1", t0, PendingTombstone("2026-01-01T00:00:00Z"))
        assertThat(buffer.take("m1", t0 + PendingRowEventBuffer.LIFETIME_MILLIS + 1)).isNull()
        assertThat(buffer.isEmpty).isTrue()
    }

    @Test
    fun `un evenement dans la duree est rendu une seule fois`() {
        val buffer = PendingRowEventBuffer()
        buffer.rememberTombstone("m1", t0, PendingTombstone("2026-01-01T00:00:00Z"))
        assertThat(buffer.take("m1", t0 + 1_000)?.tombstone).isNotNull()
        assertThat(buffer.take("m1", t0 + 1_000)).isNull()
    }

    @Test
    fun `au dela du plafond le plus ancien part`() {
        val buffer = PendingRowEventBuffer(cap = 3)
        listOf("a", "b", "c", "d").forEachIndexed { index, id ->
            buffer.rememberReaction(id, t0 + index, PendingReaction("👍", 1))
        }
        assertThat(buffer.count).isEqualTo(3)
        assertThat(buffer["a"]).isNull()
        assertThat(buffer["d"]).isNotNull()
    }

    @Test
    fun `les reactions d une ligne sont bornees`() {
        val buffer = PendingRowEventBuffer(reactionCapPerRow = 2)
        repeat(5) { buffer.rememberReaction("m1", t0, PendingReaction("e$it", 1)) }
        assertThat(buffer["m1"]?.reactions?.map { it.emoji }).containsExactly("e3", "e4").inOrder()
    }

    @Test
    fun `une edition ancienne n ecrase pas une plus recente gardee`() {
        val buffer = PendingRowEventBuffer()
        buffer.rememberEdit("m1", t0, PendingEdit("recent", "2026-01-01T10:00:10Z"))
        buffer.rememberEdit("m1", t0, PendingEdit("ancien", "2026-01-01T10:00:05Z"))
        assertThat(buffer["m1"]?.edit?.newContent).isEqualTo("recent")
    }

    @Test
    fun `rejeu dans l ordre edition reactions suppression et la suppression l emporte`() {
        val events = PendingRowEvents(
            rememberedAtMillis = t0,
            edit = PendingEdit("apres", "2026-01-01T10:00:00Z"),
            reactions = listOf(PendingReaction("👍", 1)),
            tombstone = PendingTombstone("2026-01-01T11:00:00Z"),
        )
        val replayed = PendingRowEventReplay.apply(message(), events).message!!
        assertThat(replayed.deletedAt).isEqualTo("2026-01-01T11:00:00Z")
        assertThat(replayed.content).isEmpty()
        assertThat(replayed.reactionSummary).containsExactly("👍", 1)
    }

    @Test
    fun `l edition rejouee marque modifie et retire les traductions du texte d avant`() {
        val translated = message {
            it.copy(translations = listOf(ApiTextTranslation(targetLanguage = "en", translatedContent = "before")))
        }
        val replayed = PendingRowEventReplay.apply(
            translated,
            PendingRowEvents(t0, edit = PendingEdit("apres", "2026-01-01T10:00:00Z")),
        ).message!!
        assertThat(replayed.content).isEqualTo("apres")
        assertThat(replayed.isEdited).isTrue()
        assertThat(replayed.translations).isEmpty()
    }

    @Test
    fun `un avis complete sur place ne marque pas modifie`() {
        val replayed = PendingRowEventReplay.apply(
            message(),
            PendingRowEvents(t0, edit = PendingEdit("apres", "2026-01-01T10:00:00Z", marksEdited = false)),
        ).message!!
        assertThat(replayed.isEdited).isFalse()
    }

    @Test
    fun `une edition rejouee plus ancienne que celle du message ne regresse pas`() {
        val current = message { it.copy(content = "recent", isEdited = true, editedAt = "2026-01-01T10:00:10Z") }
        val replayed = PendingRowEventReplay.apply(
            current,
            PendingRowEvents(t0, edit = PendingEdit("ancien", "2026-01-01T10:00:05Z")),
        ).message!!
        assertThat(replayed.content).isEqualTo("recent")
    }

    @Test
    fun `une reaction retiree rejouee fait disparaitre le compte`() {
        val reacted = message { it.copy(reactionSummary = mapOf("👍" to 1)) }
        val replayed = PendingRowEventReplay.apply(
            reacted,
            PendingRowEvents(t0, reactions = listOf(PendingReaction("👍", -1))),
        ).message!!
        assertThat(replayed.reactionSummary).isNull()
    }

    @Test
    fun `une vue unique ouverte epargnee garde son enveloppe quand le serveur annonce la suppression`() {
        val viewOnce = message { it.copy(isViewOnce = true, content = "secret") }
        val replayed = PendingRowEventReplay.apply(
            viewOnce,
            PendingRowEvents(t0, tombstone = PendingTombstone("2026-01-01T11:00:00Z", sparingOpenedViewOnce = true)),
        ).message!!
        assertThat(replayed.deletedAt).isNull()
        assertThat(replayed.content).isEmpty()
        assertThat(replayed.consumedByMe).isTrue()
    }

    @Test
    fun `une mort par expiration retire la ligne`() {
        val replay = PendingRowEventReplay.apply(
            message(),
            PendingRowEvents(t0, tombstone = PendingTombstone("2026-01-01T11:00:00Z", expired = true)),
        )
        assertThat(replay.message).isNull()
    }
}
