package me.meeshy.sdk.model.profile

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.ProfileDecorRef
import me.meeshy.sdk.model.ProfileDecorSide
import me.meeshy.sdk.model.ProfileDecorWrite
import org.junit.Test

class ProfileDecorWriteTest {

    private fun encode(write: ProfileDecorWrite) = Json.encodeToString(ProfileDecorWrite.serializer(), write)

    @Test
    fun `an untouched side is absent from the body`() {
        assertThat(encode(ProfileDecorWrite())).isEqualTo("{}")
    }

    @Test
    fun `a removed side is an explicit null and only that side`() {
        assertThat(encode(ProfileDecorWrite.side(ProfileDecorSide.BANNER_FRAME, null)))
            .isEqualTo("""{"bannerFrame":null}""")
    }

    @Test
    fun `an equipped side carries its pack and item`() {
        assertThat(encode(ProfileDecorWrite.side(ProfileDecorSide.AVATAR_RING, ProfileDecorRef("p", "i"))))
            .isEqualTo("""{"avatarRing":{"pack":"p","item":"i"}}""")
    }
}
