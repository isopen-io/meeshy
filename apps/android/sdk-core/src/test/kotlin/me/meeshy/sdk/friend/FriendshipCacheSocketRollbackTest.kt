package me.meeshy.sdk.friend

import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.FriendRequestCancelledEvent
import me.meeshy.sdk.model.FriendRequestRejectedEvent
import me.meeshy.sdk.model.friend.FriendshipStatus
import me.meeshy.sdk.socket.FriendRequestSocketEventsManager
import me.meeshy.sdk.sync.FriendshipRealtimeApplier
import me.meeshy.sdk.sync.RecordingRegistrar
import org.junit.Test

class FriendshipCacheSocketRollbackTest {

    private class Rig(persisted: CountingPersisted = CountingPersisted()) {
        val cancelled = MutableSharedFlow<FriendRequestCancelledEvent>()
        val rejected = MutableSharedFlow<FriendRequestRejectedEvent>()
        val cache = FriendshipCache(persisted, null)
        val registrar = RecordingRegistrar()
        val persistedCaches = persisted

        init {
            val socket = mockk<FriendRequestSocketEventsManager> {
                io.mockk.every { cancelled } returns this@Rig.cancelled
                io.mockk.every { rejected } returns this@Rig.rejected
            }
            FriendshipRealtimeApplier(socket, cache).subscribe(registrar)
        }
    }

    private class CountingPersisted : PersistedFriendCaches {
        var invalidations = 0
        override suspend fun invalidate() { invalidations++ }
        override suspend fun seed(): FriendshipSeed? = null
    }

    @Test
    fun `l'autre partie annule sa demande recue, le bouton Ajouter revient`() = runTest {
        val rig = Rig()
        rig.cache.didReceiveRequest("u2", "r1")
        rig.registrar.deliver(rig.cancelled, FriendRequestCancelledEvent("r1", cancelledBy = "u2"))
        assertThat(rig.cache.status("u2")).isEqualTo(FriendshipStatus.None)
        assertThat(rig.persistedCaches.invalidations).isEqualTo(1)
    }

    @Test
    fun `l'annulation retire aussi une demande que j'avais envoyee`() = runTest {
        val rig = Rig()
        rig.cache.didSendRequest("u2", "r1")
        rig.registrar.deliver(rig.cancelled, FriendRequestCancelledEvent(null, cancelledBy = "u2"))
        assertThat(rig.cache.status("u2")).isEqualTo(FriendshipStatus.None)
    }

    @Test
    fun `un refus vide la demande envoyee de celui qui refuse`() = runTest {
        val rig = Rig()
        rig.cache.didSendRequest("u3", "r2")
        rig.registrar.deliver(rig.rejected, FriendRequestRejectedEvent("r2", rejecterId = "u3"))
        assertThat(rig.cache.status("u3")).isEqualTo(FriendshipStatus.None)
    }

    @Test
    fun `un refus ne touche pas une demande recue du meme pair`() = runTest {
        val rig = Rig()
        rig.cache.didReceiveRequest("u3", "r9")
        rig.registrar.deliver(rig.rejected, FriendRequestRejectedEvent(null, rejecterId = "u3"))
        assertThat(rig.cache.status("u3")).isNotEqualTo(FriendshipStatus.None)
    }

    @Test
    fun `rejouer l'evenement est idempotent`() = runTest {
        val rig = Rig()
        rig.cache.didSendRequest("u2", "r1")
        repeat(2) { rig.registrar.deliver(rig.cancelled, FriendRequestCancelledEvent("r1", cancelledBy = "u2")) }
        assertThat(rig.cache.status("u2")).isEqualTo(FriendshipStatus.None)
    }
}
