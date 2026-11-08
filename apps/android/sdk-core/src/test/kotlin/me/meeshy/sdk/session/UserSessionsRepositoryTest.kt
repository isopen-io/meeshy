package me.meeshy.sdk.session

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.session.GeolocationAttribution
import me.meeshy.sdk.model.session.UserSession
import me.meeshy.sdk.model.session.UserSessionsPayload
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.AuthApi
import org.junit.Test
import java.io.IOException

class UserSessionsRepositoryTest {

    private class FixedClock(var now: Long) : CacheClock {
        override fun nowMillis(): Long = now
    }

    private val me = UserSession(id = "me", isCurrentSession = true)
    private val phone = UserSession(id = "phone")
    private val tablet = UserSession(id = "tablet")
    private val served = UserSessionsPayload(listOf(phone, me, tablet), totalCount = 3)

    private class Rig(
        val api: AuthApi,
        val store: InMemoryUserSessionsSnapshotStore,
        val clock: FixedClock,
        val repository: UserSessionsRepository,
    )

    private fun rig(now: Long = 1_000_000L): Rig {
        val api = mockk<AuthApi>()
        val store = InMemoryUserSessionsSnapshotStore()
        val clock = FixedClock(now)
        return Rig(api, store, clock, UserSessionsRepository(api, store, clock))
    }

    @Test
    fun `a cold cache is Empty then Fresh after the first network call`() = runTest {
        val rig = rig()
        coEvery { rig.api.listSessions() } returns ApiResponse(success = true, data = served)

        val results = rig.repository.stream().take(2).toList()

        assertThat(results[0]).isEqualTo(CacheResult.Empty)
        assertThat(results[1]).isInstanceOf(CacheResult.Fresh::class.java)
        assertThat((results[1] as CacheResult.Fresh).value).isEqualTo(served)
        assertThat(rig.repository.syncFailure.value).isNull()
    }

    @Test
    fun `a stale snapshot is served at once then revalidated`() = runTest {
        val rig = rig(now = 1_000_000L)
        rig.store.save(UserSessionsPayload(listOf(me), totalCount = 1), 1_000_000L - 10 * 60_000L)
        coEvery { rig.api.listSessions() } returns ApiResponse(success = true, data = served)

        val results = rig.repository.stream().take(2).toList()

        assertThat(results[0]).isInstanceOf(CacheResult.Stale::class.java)
        assertThat((results[0] as CacheResult.Stale).value.sessions).containsExactly(me)
        assertThat((results[1] as CacheResult.Fresh).value).isEqualTo(served)
    }

    @Test
    fun `a fresh snapshot is served without touching the network`() = runTest {
        val rig = rig()
        rig.store.save(served, rig.clock.now)
        coEvery { rig.api.listSessions() } returns ApiResponse(success = false)

        val first = rig.repository.stream().first()

        assertThat(first).isInstanceOf(CacheResult.Fresh::class.java)
        coVerify(exactly = 0) { rig.api.listSessions() }
    }

    @Test
    fun `a network failure keeps the cache and surfaces the error`() = runTest {
        val rig = rig()
        rig.store.save(served, rig.clock.now - 10 * 60_000L)
        coEvery { rig.api.listSessions() } throws IOException("offline")

        val seen = mutableListOf<CacheResult<UserSessionsPayload>>()
        backgroundScope.launch { rig.repository.stream().collect { seen += it } }
        runCurrent()

        assertThat((seen.single() as CacheResult.Stale).value).isEqualTo(served)
        assertThat(rig.store.observe().first()).isEqualTo(served)
        assertThat(rig.repository.syncFailure.value).isNotNull()
    }

    @Test
    fun `a later successful revalidation clears the failure banner`() = runTest {
        val rig = rig()
        rig.store.save(served, rig.clock.now - 10 * 60_000L)
        coEvery { rig.api.listSessions() } throws IOException("offline")
        backgroundScope.launch { rig.repository.stream().collect { } }
        runCurrent()
        assertThat(rig.repository.syncFailure.value).isNotNull()

        coEvery { rig.api.listSessions() } returns ApiResponse(success = true, data = served)
        rig.clock.now += 10 * 60_000L
        rig.store.save(served, rig.clock.now - 10 * 60_000L)
        runCurrent()

        assertThat(rig.repository.syncFailure.value).isNull()
    }

    @Test
    fun `the server geolocation attribution is kept and DB-IP is the fallback`() = runTest {
        val rig = rig()
        val attribution = GeolocationAttribution(provider = "ACME", text = "by ACME", url = "https://acme.test", license = "x")
        coEvery { rig.api.listSessions() } returns
            ApiResponse(success = true, data = served.copy(geolocation = attribution))

        rig.repository.refresh()

        assertThat(rig.store.observe().first()!!.attribution).isEqualTo(attribution)
        assertThat(served.attribution).isEqualTo(GeolocationAttribution.DB_IP)
    }

    @Test
    fun `revoking removes the row at once and persists the new state`() = runTest {
        val rig = rig()
        rig.store.save(served, rig.clock.now)
        coEvery { rig.api.revokeSession("tablet") } returns ApiResponse(success = true)

        val result = rig.repository.revoke("tablet")

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        assertThat(rig.store.observe().first()!!.sessions).containsExactly(phone, me).inOrder()
        assertThat(rig.store.observe().first()!!.totalCount).isEqualTo(2)
    }

    @Test
    fun `a failed revocation puts the row back at its index`() = runTest {
        val rig = rig()
        rig.store.save(served, rig.clock.now)
        coEvery { rig.api.revokeSession("phone") } returns ApiResponse(success = false, error = "no")

        val result = rig.repository.revoke("phone")

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat(rig.store.observe().first()!!.sessions).containsExactly(phone, me, tablet).inOrder()
    }

    @Test
    fun `the current session is never revoked through this path`() = runTest {
        val rig = rig()
        rig.store.save(served, rig.clock.now)

        val result = rig.repository.revoke("me")

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        coVerify(exactly = 0) { rig.api.revokeSession(any()) }
        assertThat(rig.store.observe().first()!!.sessions).containsExactly(phone, me, tablet).inOrder()
    }

    @Test
    fun `revoking the others keeps only the current session and rolls back on failure`() = runTest {
        val rig = rig()
        rig.store.save(served, rig.clock.now)
        coEvery { rig.api.revokeOtherSessions() } returns ApiResponse(success = true)

        rig.repository.revokeOthers()
        assertThat(rig.store.observe().first()!!.sessions).containsExactly(me)

        rig.store.save(served, rig.clock.now)
        coEvery { rig.api.revokeOtherSessions() } throws IOException("offline")

        val failed = rig.repository.revokeOthers()

        assertThat(failed).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat(rig.store.observe().first()!!.sessions).containsExactly(phone, me, tablet).inOrder()
    }
}
