package me.meeshy.sdk.model.ongoing

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class OutboxActivityLawTest {

    private val wording = OutboxActivityLaw.Wording(
        story = "Publication d'une story",
        media = "Envoi d'un média",
        messageWithMedia = "Envoi d'un message avec média",
        sent = "Envoyé",
        failed = "Échec de l'envoi",
    )

    private fun item(
        id: String,
        kind: OutboxActivityKind = OutboxActivityKind.Media,
        terminal: Boolean = false,
        dependsOn: Set<String> = emptySet(),
    ) = OutboxActivityItem(id = id, kind = kind, isTerminal = terminal, dependsOnIds = dependsOn)

    private fun step(
        running: OutboxActivityLaw.Running? = null,
        items: List<OutboxActivityItem>,
        offline: Boolean = false,
    ) = OutboxActivityLaw.step(running, items, offline, wording)

    @Test
    fun `an empty queue opens nothing`() {
        val step = step(items = emptyList())

        assertThat(step.action).isEqualTo(OutboxActivityLaw.Action.None)
        assertThat(step.running).isNull()
    }

    @Test
    fun `short sends never open the activity`() {
        val step = step(items = listOf(item("a", OutboxActivityKind.Text), item("b", OutboxActivityKind.Other)))

        assertThat(step.action).isEqualTo(OutboxActivityLaw.Action.None)
    }

    @Test
    fun `a media upload opens the activity with the neutral media label`() {
        val start = step(items = listOf(item("a"))).action as OutboxActivityLaw.Action.Start

        assertThat(start.snapshot.phase).isEqualTo(OutboxActivityPhase.Sending)
        assertThat(start.snapshot.remaining).isEqualTo(1)
        assertThat(start.snapshot.label).isEqualTo("Envoi d'un média")
    }

    @Test
    fun `the head of the queue names the activity by its kind`() {
        assertThat(labelOf(item("s", OutboxActivityKind.Story))).isEqualTo("Publication d'une story")
        assertThat(labelOf(item("m", OutboxActivityKind.MessageWithMedia))).isEqualTo("Envoi d'un message avec média")
    }

    @Test
    fun `a message waiting behind its own upload is counted once`() {
        val start = step(
            items = listOf(
                item("up"),
                item("msg", OutboxActivityKind.MessageWithMedia, dependsOn = setOf("up")),
            ),
        ).action as OutboxActivityLaw.Action.Start

        assertThat(start.snapshot.remaining).isEqualTo(1)
    }

    @Test
    fun `losing the network turns the phase into waiting and a change updates once`() {
        val first = step(items = listOf(item("a")))

        val offline = step(first.running, listOf(item("a")), offline = true)
        val update = offline.action as OutboxActivityLaw.Action.Update
        assertThat(update.snapshot.phase).isEqualTo(OutboxActivityPhase.WaitingForNetwork)

        assertThat(step(offline.running, listOf(item("a")), offline = true).action)
            .isEqualTo(OutboxActivityLaw.Action.None)
    }

    @Test
    fun `an unchanged snapshot does not wake the notification`() {
        val first = step(items = listOf(item("a")))

        assertThat(step(first.running, listOf(item("a"))).action).isEqualTo(OutboxActivityLaw.Action.None)
    }

    @Test
    fun `the queue draining ends the activity as sent`() {
        val first = step(items = listOf(item("a")))

        val end = step(first.running, emptyList()).action as OutboxActivityLaw.Action.End
        assertThat(end.snapshot.phase).isEqualTo(OutboxActivityPhase.Sent)
        assertThat(end.snapshot.label).isEqualTo("Envoyé")
    }

    @Test
    fun `a tracked send that gave up ends the activity as failed`() {
        val first = step(items = listOf(item("a")))

        val end = step(first.running, listOf(item("a", terminal = true))).action as OutboxActivityLaw.Action.End
        assertThat(end.snapshot.phase).isEqualTo(OutboxActivityPhase.Failed)
        assertThat(end.snapshot.label).isEqualTo("Échec de l'envoi")
    }

    @Test
    fun `a row that failed yesterday does not turn today's success red`() {
        val first = step(items = listOf(item("old", terminal = true), item("new")))
        assertThat(first.running!!.failedIds).isEmpty()

        val end = step(first.running, listOf(item("old", terminal = true))).action as OutboxActivityLaw.Action.End
        assertThat(end.snapshot.phase).isEqualTo(OutboxActivityPhase.Sent)
    }

    @Test
    fun `an outcome stays on screen briefly and a failure longer`() {
        assertThat(OutboxActivityLaw.dismissalDelayMs(OutboxActivityPhase.Sent)).isEqualTo(3_000L)
        assertThat(OutboxActivityLaw.dismissalDelayMs(OutboxActivityPhase.Failed)).isEqualTo(8_000L)
    }

    private fun labelOf(item: OutboxActivityItem): String =
        (step(items = listOf(item)).action as OutboxActivityLaw.Action.Start).snapshot.label
}
