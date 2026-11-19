package me.meeshy.sdk.community

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestCoroutineScheduler
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.CommunityMemberChange
import me.meeshy.sdk.model.MemberRole
import me.meeshy.sdk.socket.SocketEventRegistrar
import me.meeshy.sdk.socket.SocketEventRouter
import me.meeshy.sdk.socket.SocketManager
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Les trois gestes de l'effectif atteignent le cache des communautés, dans l'ordre d'arrivée, une fois attaché. */
@RunWith(RobolectricTestRunner::class)
class CommunityMemberBindingTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }
    private val scheduler = TestCoroutineScheduler()
    private val dispatcher = StandardTestDispatcher(scheduler)

    private fun wired(applied: MutableList<Pair<CommunityMemberChange, String?>>): Pair<CommunityMemberBinding, Map<String, (Array<Any>) -> Unit>> {
        val handlers = mutableMapOf<String, (Array<Any>) -> Unit>()
        val socket: SocketManager = mockk(relaxed = true)
        every { socket.on(any(), any()) } answers { handlers[firstArg()] = secondArg() }
        val router = SocketEventRouter(SocketEventRegistrar { event, callback -> socket.on(event, callback) }, dispatcher)
        val binding = CommunityMemberBinding(router, json, dispatcher, { "me" }) { change, viewer -> applied += change to viewer }
        return binding to handlers
    }

    private fun joined(userId: String, role: String = "member") = JSONObject(
        """{"communityId":"c1","userId":"$userId","role":"$role","via":"self","memberCount":3,"at":"2026-11-17T12:00:00.000Z"}""",
    )

    @Test
    fun `rien n ecoute avant l attache`() {
        val (_, handlers) = wired(mutableListOf())
        assertThat(handlers.keys.filter { it.startsWith("community:member") }).isEmpty()
    }

    @Test
    fun `les trois gestes sont appliques au cache dans l ordre d arrivee, avec le lecteur`() = runTest(dispatcher) {
        val applied = mutableListOf<Pair<CommunityMemberChange, String?>>()
        val (binding, handlers) = wired(applied)
        binding.attach()
        scheduler.advanceUntilIdle()

        handlers.getValue("community:member-joined").invoke(arrayOf(joined("u3")))
        handlers.getValue("community:member-role-updated").invoke(
            arrayOf(JSONObject("""{"communityId":"c1","userId":"u3","role":"moderator","memberCount":3,"at":"2026-11-17T12:01:00.000Z"}""")),
        )
        handlers.getValue("community:member-left").invoke(
            arrayOf(JSONObject("""{"communityId":"c1","userId":"u3","reason":"removed","memberCount":2,"at":"2026-11-17T12:02:00.000Z"}""")),
        )
        scheduler.advanceUntilIdle()

        assertThat(applied.map { it.first.kind }).containsExactly(
            CommunityMemberChange.Kind.JOINED,
            CommunityMemberChange.Kind.ROLE_UPDATED,
            CommunityMemberChange.Kind.LEFT,
        ).inOrder()
        assertThat(applied.map { it.first.role }).containsExactly(MemberRole.MEMBER, MemberRole.MODERATOR, null).inOrder()
        assertThat(applied.map { it.second }.toSet()).containsExactly("me")
        binding.detach()
    }

    @Test
    fun `une charge illisible ou au role inconnu est ecartee sans couper le flux`() = runTest(dispatcher) {
        val applied = mutableListOf<Pair<CommunityMemberChange, String?>>()
        val (binding, handlers) = wired(applied)
        binding.attach()
        scheduler.advanceUntilIdle()

        handlers.getValue("community:member-joined").invoke(arrayOf(JSONObject("""{"communityId":"c1"}""")))
        handlers.getValue("community:member-joined").invoke(arrayOf(joined("u4", role = "creator")))
        handlers.getValue("community:member-joined").invoke(arrayOf(joined("u5")))
        scheduler.advanceUntilIdle()

        assertThat(applied.map { it.first.userId }).containsExactly("u5")
        binding.detach()
    }

    @Test
    fun `apres la deconnexion plus rien n est applique`() = runTest(dispatcher) {
        val applied = mutableListOf<Pair<CommunityMemberChange, String?>>()
        val (binding, handlers) = wired(applied)
        binding.attach()
        binding.detach()

        handlers.getValue("community:member-joined").invoke(arrayOf(joined("u6")))
        scheduler.advanceUntilIdle()

        assertThat(applied).isEmpty()
    }
}
