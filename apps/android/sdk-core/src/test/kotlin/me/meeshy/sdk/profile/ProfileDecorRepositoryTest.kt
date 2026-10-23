package me.meeshy.sdk.profile

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.async
import kotlinx.coroutines.test.advanceUntilIdle
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.PackOrigin
import me.meeshy.sdk.model.ProfileDecorSide
import me.meeshy.sdk.model.ServedProfileDecor
import me.meeshy.sdk.model.ServedProfileDecorItem
import me.meeshy.sdk.model.profile.ProfileDecorUpdatedEvent
import me.meeshy.sdk.net.InMemoryTokenStore
import me.meeshy.sdk.net.api.AuthApi
import me.meeshy.sdk.net.api.UserApi
import me.meeshy.sdk.session.SessionRepository
import org.junit.Test

class ProfileDecorRepositoryTest {

    private fun item(pack: String, key: String) = ServedProfileDecorItem(pack, key, PackOrigin.BUILTIN)

    private class Scenario(val repository: ProfileDecorRepository, val session: SessionRepository, val api: UserApi) {
        val decor: ServedProfileDecor get() = session.currentUser.value!!.servedDecor
    }

    private fun scenario(initial: ServedProfileDecor = ServedProfileDecor.EMPTY, configure: UserApi.() -> Unit): Scenario {
        val session = SessionRepository(mockk<AuthApi>(), InMemoryTokenStore(jwt = "j", sessionToken = "s"))
        session.adopt(MeeshyUser(id = "me", username = "me", displayName = "Moi", profileDecor = initial))
        val api = mockk<UserApi>().apply(configure)
        return Scenario(ProfileDecorRepository(api, session), session, api)
    }

    @Test
    fun `equip publishes the choice at once then the server answer wins`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val served = ServedProfileDecor(avatarRing = item("p", "ring"))
        val s = scenario { coEvery { updateProfileDecor(any()) } coAnswers { gate.await(); ApiResponse(success = true, data = served) } }

        val pending = async { s.repository.equip(item("p", "ring"), ProfileDecorSide.AVATAR_RING) }
        advanceUntilIdle()
        assertThat(s.decor.avatarRing).isEqualTo(item("p", "ring"))
        assertThat(s.session.currentUser.value!!.displayName).isEqualTo("Moi")

        gate.complete(Unit)
        assertThat(pending.await()).isEqualTo(ProfileDecorOutcome.Confirmed(served))
        assertThat(s.decor).isEqualTo(served)
    }

    @Test
    fun `a failure rolls back only the touched side`() = runTest {
        val initial = ServedProfileDecor(avatarRing = item("p", "old"), banner = item("b", "keep"))
        val s = scenario(initial) { coEvery { updateProfileDecor(any()) } throws IOException("offline") }

        val outcome = s.repository.equip(item("p", "new"), ProfileDecorSide.AVATAR_RING)

        assertThat(outcome).isEqualTo(ProfileDecorOutcome.Failed(ProfileDecorError.SAVE_FAILED))
        assertThat(s.decor).isEqualTo(initial)
    }

    @Test
    fun `a refusal rolls back a removed side`() = runTest {
        val initial = ServedProfileDecor(bannerFrame = item("f", "gold"))
        val s = scenario(initial) { coEvery { updateProfileDecor(any()) } returns ApiResponse(success = false, error = "no") }

        val outcome = s.repository.equip(null, ProfileDecorSide.BANNER_FRAME)

        assertThat(outcome).isInstanceOf(ProfileDecorOutcome.Failed::class.java)
        assertThat(s.decor.bannerFrame).isEqualTo(item("f", "gold"))
    }

    @Test
    fun `a late answer of an older choice neither overwrites nor restores a newer one`() = runTest {
        val first = CompletableDeferred<Unit>()
        var calls = 0
        val newer = ServedProfileDecor(avatarRing = item("p", "b"))
        val s = scenario {
            coEvery { updateProfileDecor(any()) } coAnswers {
                if (++calls == 1) { first.await(); throw IOException("late failure") }
                ApiResponse(success = true, data = newer)
            }
        }

        val older = async { s.repository.equip(item("p", "a"), ProfileDecorSide.AVATAR_RING) }
        advanceUntilIdle()
        val latest = s.repository.equip(item("p", "b"), ProfileDecorSide.AVATAR_RING)
        first.complete(Unit)

        assertThat(older.await()).isEqualTo(ProfileDecorOutcome.Superseded)
        assertThat(latest).isEqualTo(ProfileDecorOutcome.Confirmed(newer))
        assertThat(s.decor.avatarRing).isEqualTo(item("p", "b"))
    }

    @Test
    fun `an event from another account is ignored and mine updates the decor`() = runTest {
        val s = scenario { }
        val other = ServedProfileDecor(banner = item("b", "x"))

        s.repository.onEvent(ProfileDecorUpdatedEvent(userId = "someone", decor = other))
        assertThat(s.decor).isEqualTo(ServedProfileDecor.EMPTY)

        s.repository.onEvent(ProfileDecorUpdatedEvent(userId = "me", decor = other))
        assertThat(s.decor).isEqualTo(other)
    }

    @Test
    fun `an event does not overwrite a side whose choice is in flight`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val s = scenario { coEvery { updateProfileDecor(any()) } coAnswers { gate.await(); throw IOException() } }

        val pending = async { s.repository.equip(item("p", "mine"), ProfileDecorSide.AVATAR_RING) }
        advanceUntilIdle()
        s.repository.onEvent(
            ProfileDecorUpdatedEvent("me", ServedProfileDecor(avatarRing = item("p", "other"), banner = item("b", "y"))),
        )

        assertThat(s.decor.avatarRing).isEqualTo(item("p", "mine"))
        assertThat(s.decor.banner).isEqualTo(item("b", "y"))
        gate.complete(Unit)
        pending.await()
    }
}
