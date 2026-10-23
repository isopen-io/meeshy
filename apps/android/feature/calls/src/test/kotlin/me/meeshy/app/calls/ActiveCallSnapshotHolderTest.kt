package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ongoing.CallActivityPhase
import me.meeshy.sdk.model.ongoing.CallActivitySnapshot
import org.junit.Test

class ActiveCallSnapshotHolderTest {

    private fun snapshot(title: String = "Alice") = CallActivitySnapshot(
        phase = CallActivityPhase.Connected,
        title = title,
        statusLabel = "Audio call",
        initials = "A",
        isVideo = false,
        isMuted = false,
        connectedSinceEpochMs = 1_000L,
        showsDurationInCompact = true,
        caption = null,
    )

    private class Recording : ActiveCallCommands {
        var hangUps = 0
        var mutes = 0
        override fun hangUp() { hangUps += 1 }
        override fun toggleMute() { mutes += 1 }
    }

    @Test
    fun `starts with nothing to show`() {
        assertThat(ActiveCallSnapshotHolder().snapshot.value).isNull()
    }

    @Test
    fun `publishes the latest snapshot`() {
        val holder = ActiveCallSnapshotHolder()
        holder.publish(snapshot("Alice"))
        holder.publish(snapshot("Bob"))
        assertThat(holder.snapshot.value?.title).isEqualTo("Bob")
    }

    @Test
    fun `commands without an active call do nothing`() {
        val holder = ActiveCallSnapshotHolder()
        holder.hangUp()
        holder.toggleMute()
        assertThat(holder.snapshot.value).isNull()
    }

    @Test
    fun `commands reach the attached call`() {
        val holder = ActiveCallSnapshotHolder()
        val call = Recording()
        holder.attach(call)
        holder.hangUp()
        holder.toggleMute()
        assertThat(call.hangUps).isEqualTo(1)
        assertThat(call.mutes).isEqualTo(1)
    }

    @Test
    fun `a stale call cannot detach a newer one`() {
        val holder = ActiveCallSnapshotHolder()
        val old = Recording()
        val newer = Recording()
        holder.attach(old)
        holder.attach(newer)
        holder.detach(old)
        holder.hangUp()
        assertThat(newer.hangUps).isEqualTo(1)
        assertThat(old.hangUps).isEqualTo(0)
    }

    @Test
    fun `detaching the attached call silences the commands`() {
        val holder = ActiveCallSnapshotHolder()
        val call = Recording()
        holder.attach(call)
        holder.detach(call)
        holder.hangUp()
        assertThat(call.hangUps).isEqualTo(0)
    }
}
