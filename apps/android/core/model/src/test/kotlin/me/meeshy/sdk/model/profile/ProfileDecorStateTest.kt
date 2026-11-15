package me.meeshy.sdk.model.profile

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.PackOrigin
import me.meeshy.sdk.model.ProfileDecorSide
import me.meeshy.sdk.model.ServedProfileDecor
import me.meeshy.sdk.model.ServedProfileDecorItem
import org.junit.Test

class ProfileDecorStateTest {

    private fun item(name: String) = ServedProfileDecorItem(pack = "p", item = name, origin = PackOrigin.BUILTIN)

    private fun stateWith(ring: String? = null, banner: String? = null) = ProfileDecorState(
        ServedProfileDecor(avatarRing = ring?.let(::item), banner = banner?.let(::item)),
    )

    @Test
    fun `equip applies the choice and returns the previous element of that side`() {
        val equipped = stateWith(ring = "old").equip(item("new"), ProfileDecorSide.AVATAR_RING)

        assertThat(equipped.state.decor.avatarRing).isEqualTo(item("new"))
        assertThat(equipped.previous).isEqualTo(item("old"))
    }

    @Test
    fun `equip null removes the side and leaves the others`() {
        val equipped = stateWith(ring = "r", banner = "b").equip(null, ProfileDecorSide.AVATAR_RING)

        assertThat(equipped.state.decor.avatarRing).isNull()
        assertThat(equipped.state.decor.banner).isEqualTo(item("b"))
    }

    @Test
    fun `rollback touches only its side`() {
        val equipped = stateWith(ring = "r").equip(item("x"), ProfileDecorSide.AVATAR_RING)
        val withBanner = equipped.state.equip(item("b"), ProfileDecorSide.BANNER).state

        val rolled = withBanner.rollback(ProfileDecorSide.AVATAR_RING, equipped.previous)

        assertThat(rolled.decor.avatarRing).isEqualTo(item("r"))
        assertThat(rolled.decor.banner).isEqualTo(item("b"))
    }

    @Test
    fun `confirm replaces the decor by the served answer`() {
        val served = ServedProfileDecor(bannerFrame = item("f"))

        assertThat(stateWith(ring = "r").confirm(served).decor).isEqualTo(served)
    }

    @Test
    fun `an event carrying my user id replaces the decor`() {
        val event = ProfileDecorUpdatedEvent("me", ServedProfileDecor(banner = item("b")))

        assertThat(stateWith(ring = "r").apply(event, myUserId = "me").decor.banner).isEqualTo(item("b"))
    }

    @Test
    fun `an event of another account is ignored`() {
        val state = stateWith(ring = "r")
        val event = ProfileDecorUpdatedEvent("other", ServedProfileDecor(banner = item("b")))

        assertThat(state.apply(event, myUserId = "me")).isEqualTo(state)
    }

    @Test
    fun `the event decodes tolerantly from the wire`() {
        val json = Json { ignoreUnknownKeys = true }
        val event = json.decodeFromString(
            ProfileDecorUpdatedEvent.serializer(),
            """{"userId":"me","decor":{"avatarRing":{"pack":"a","item":"b","origin":"builtin"},"banner":7},"at":"2026-10-14T10:00:00.000Z"}""",
        )

        assertThat(event.userId).isEqualTo("me")
        assertThat(event.decor.avatarRing?.item).isEqualTo("b")
        assertThat(event.decor.banner).isNull()
    }
}
