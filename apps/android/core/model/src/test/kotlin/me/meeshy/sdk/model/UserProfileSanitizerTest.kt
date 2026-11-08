package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class UserProfileSanitizerTest {
    private fun user(avatar: String? = null, banner: String? = null) = MeeshyUser(
        id = "u1", username = "alice", avatar = avatar, avatarThumbHash = "a".takeIf { avatar != null },
        banner = banner, bannerThumbHash = "b".takeIf { banner != null }, bio = "hi",
    )

    @Test
    fun `data uri avatar and banner are dropped with their thumbhash`() {
        val out = user("data:image/png;base64,AAA", "data:image/jpeg;base64,BBB").droppingDataUriImages()
        assertThat(out.avatar).isNull()
        assertThat(out.banner).isNull()
        assertThat(out.avatarThumbHash).isNull()
        assertThat(out.bannerThumbHash).isNull()
        assertThat(out.bio).isEqualTo("hi")
    }

    @Test
    fun `https urls are kept`() {
        val u = user("https://m.me/a.png", "https://m.me/b.png")
        assertThat(u.droppingDataUriImages()).isEqualTo(u)
    }

    @Test
    fun `only the data image is dropped`() {
        val out = user("https://m.me/a.png", "data:image/png;base64,B").droppingDataUriImages()
        assertThat(out.avatar).isEqualTo("https://m.me/a.png")
        assertThat(out.banner).isNull()
    }

    @Test
    fun `a user without images is unchanged`() {
        val u = user()
        assertThat(u.droppingDataUriImages()).isSameInstanceAs(u)
    }
}
