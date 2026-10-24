package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class ServedProfileDecorDecodingTest {

    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

    private fun decode(raw: String) = json.decodeFromString(ServedProfileDecor.serializer(), raw)

    @Test
    fun `a corrupt side does not invalidate the two others`() {
        val decor = decode(
            """{"avatarRing":{"pack":"halo","item":"gold","origin":"builtin"},
                "banner":"garbage",
                "bannerFrame":{"pack":"frames","item":"neon","origin":"official","contract":"abc123.json"}}""",
        )

        assertThat(decor.avatarRing?.item).isEqualTo("gold")
        assertThat(decor.banner).isNull()
        assertThat(decor.bannerFrame?.contract).isEqualTo("abc123.json")
        assertThat(decor.bannerFrame?.origin).isEqualTo(PackOrigin.OFFICIAL)
    }

    @Test
    fun `an item missing its pack or item is dropped alone`() {
        val decor = decode("""{"avatarRing":{"pack":"halo"},"banner":{"pack":"b","item":"i"}}""")

        assertThat(decor.avatarRing).isNull()
        assertThat(decor.banner?.ref).isEqualTo(ProfileDecorRef("b", "i"))
    }

    @Test
    fun `an unknown origin reads as unknown`() {
        val decor = decode("""{"banner":{"pack":"b","item":"i","origin":"alien"}}""")

        assertThat(decor.banner?.origin).isEqualTo(PackOrigin.UNKNOWN)
    }

    @Test
    fun `an old server without bannerFrame gives an empty frame side`() {
        val decor = decode("""{"avatarRing":{"pack":"a","item":"b","origin":"builtin"}}""")

        assertThat(decor.bannerFrame).isNull()
        assertThat(decor.avatarRing).isNotNull()
    }

    @Test
    fun `a user without profileDecor serves an empty decor`() {
        val user = json.decodeFromString(MeeshyUser.serializer(), """{"id":"u","username":"x"}""")

        assertThat(user.servedDecor).isEqualTo(ServedProfileDecor.EMPTY)
    }

    @Test
    fun `a user with a non-object profileDecor decodes to the empty decor`() {
        val user = json.decodeFromString(
            MeeshyUser.serializer(),
            """{"id":"u","username":"x","profileDecor":42}""",
        )

        assertThat(user.servedDecor).isEqualTo(ServedProfileDecor.EMPTY)
    }

    @Test
    fun `a write distinguishes unchanged, cleared and set`() {
        val write = ProfileDecorWrite(
            avatarRing = ProfileDecorWrite.Change.Clear,
            banner = ProfileDecorWrite.Change.Set(ProfileDecorRef("p", "i")),
        )

        val encoded = Json.encodeToString(ProfileDecorWrite.serializer(), write)

        assertThat(encoded).isEqualTo("""{"avatarRing":null,"banner":{"pack":"p","item":"i"}}""")
    }

    @Test
    fun `the side helper touches only its side`() {
        val write = ProfileDecorWrite.side(ProfileDecorSide.BANNER_FRAME, null)

        assertThat(Json.encodeToString(ProfileDecorWrite.serializer(), write))
            .isEqualTo("""{"bannerFrame":null}""")
    }
}
