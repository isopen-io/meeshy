package me.meeshy.sdk.model.composer.sound

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class SoundShelfLawTest {
    private fun sound(
        id: String = "s1",
        title: String = "",
        createdAt: String? = "2026-10-20T10:00:00.000Z",
        postCount: Int = 0,
        username: String = "ana",
        displayName: String? = null,
    ) = ApiSound(
        id = id, title = title, fileUrl = "https://cdn/$id.m4a", createdAt = createdAt, postCount = postCount,
        uploader = ApiSoundUploader(id = "u1", username = username, displayName = displayName),
    )

    @Test
    fun `an authored title is the label`() {
        assertThat(SoundShelfLaw.title(sound(title = " Feel the pulse ")))
            .isEqualTo(SoundTitle.Authored("Feel the pulse"))
    }

    @Test
    fun `an untitled sound shows its upload date and never a server string`() {
        assertThat(SoundShelfLaw.title(sound(title = "  ")))
            .isInstanceOf(SoundTitle.UploadedAt::class.java)
    }

    @Test
    fun `an untitled undated sound falls back to the original label`() {
        assertThat(SoundShelfLaw.title(sound(createdAt = null))).isEqualTo(SoundTitle.Original)
    }

    @Test
    fun `the secondary date only shows on my own named sounds`() {
        assertThat(SoundShelfLaw.secondaryDateMillis(sound(title = "X"), isMine = true)).isNotNull()
        assertThat(SoundShelfLaw.secondaryDateMillis(sound(title = "X"), isMine = false)).isNull()
        assertThat(SoundShelfLaw.secondaryDateMillis(sound(title = ""), isMine = true)).isNull()
    }

    @Test
    fun `the author label prefers the display name then the handle`() {
        assertThat(sound(displayName = "Ana B").authorLabel).isEqualTo("Ana B")
        assertThat(sound(displayName = "").authorLabel).isEqualTo("@ana")
        assertThat(ApiSound(id = "s", fileUrl = "u").authorLabel).isNull()
    }

    @Test
    fun `local search folds case and diacritics over title handle and display name`() {
        val list = listOf(
            sound(id = "a", title = "Été indien"),
            sound(id = "b", title = "", username = "belva"),
            sound(id = "c", title = "Autre", displayName = "Zoé"),
        )
        assertThat(SoundShelfLaw.filter(list, "ete").map { it.id }).containsExactly("a")
        assertThat(SoundShelfLaw.filter(list, "BELV").map { it.id }).containsExactly("b")
        assertThat(SoundShelfLaw.filter(list, "zoe").map { it.id }).containsExactly("c")
        assertThat(SoundShelfLaw.filter(list, "   ")).hasSize(3)
        assertThat(SoundShelfLaw.filter(list, null)).hasSize(3)
    }

    @Test
    fun `removal is only offered on my own sounds`() {
        assertThat(SoundShelfLaw.canRemove(SoundShelfTab.MINE)).isTrue()
        assertThat(SoundShelfLaw.canRemove(SoundShelfTab.TRENDING)).isFalse()
        assertThat(SoundShelfLaw.canRename(SoundShelfTab.MINE)).isTrue()
        assertThat(SoundShelfLaw.canRename(SoundShelfTab.TRENDING)).isFalse()
    }

    @Test
    fun `the removal confirmation says how many publications keep playing the sound`() {
        assertThat(SoundShelfLaw.removalNotice(sound(postCount = 0))).isEqualTo(SoundRemovalNotice.Unused)
        assertThat(SoundShelfLaw.removalNotice(sound(postCount = 3))).isEqualTo(SoundRemovalNotice.StillPlayed(3))
    }

    @Test
    fun `only the library tab pages`() {
        assertThat(SoundShelfLaw.pages(SoundShelfTab.MINE)).isTrue()
        assertThat(SoundShelfLaw.pages(SoundShelfTab.TRENDING)).isFalse()
    }

    @Test
    fun `the empty message depends on the search then the tab`() {
        assertThat(SoundShelfLaw.empty(SoundShelfTab.MINE, "x")).isEqualTo(SoundShelfEmpty.NoMatch)
        assertThat(SoundShelfLaw.empty(SoundShelfTab.MINE, "")).isEqualTo(SoundShelfEmpty.NoneMine)
        assertThat(SoundShelfLaw.empty(SoundShelfTab.TRENDING, "")).isEqualTo(SoundShelfEmpty.NoneTrending)
    }

    @Test
    fun `a rename replaces the row in place`() {
        val list = listOf(sound(id = "a", title = "1"), sound(id = "b", title = "2"))
        val out = SoundShelfLaw.replacing(list, sound(id = "b", title = "nouveau"))
        assertThat(out.map { it.title }).containsExactly("1", "nouveau").inOrder()
    }

    @Test
    fun `a failed removal puts the row back at its own place`() {
        val list = listOf(sound(id = "a"), sound(id = "c"))
        val back = SoundShelfLaw.restoring(list, sound(id = "b"), index = 1)
        assertThat(back.map { it.id }).containsExactly("a", "b", "c").inOrder()
        assertThat(SoundShelfLaw.restoring(back, sound(id = "b"), index = 0)).isEqualTo(back)
        assertThat(SoundShelfLaw.restoring(list, sound(id = "z"), index = 99).map { it.id })
            .containsExactly("a", "c", "z").inOrder()
    }

    @Test
    fun `the wire decodes a gateway sound tolerating absent counters`() {
        val json = Json { ignoreUnknownKeys = true }
        val s = json.decodeFromString<ApiSound>(
            """{"id":"s1","title":"","fileUrl":"https://x/a.m4a","durationMs":4200,"waveform":[0.1,0.5],
               "isPublic":true,"isAutoGenerated":true,"createdAt":"2026-10-20T10:00:00.000Z",
               "uploader":{"id":"u","username":"ana","displayName":null,"avatar":null},"extra":1}""",
        )
        assertThat(s.postCount).isEqualTo(0)
        assertThat(s.usageCount).isEqualTo(0)
        assertThat(s.waveform).hasSize(2)
        assertThat(s.durationMs).isEqualTo(4200L)
        val removal = json.decodeFromString<SoundRemoval>("""{"id":"s1","deletedAt":"2026-10-27T00:00:00.000Z"}""")
        assertThat(removal.postCount).isEqualTo(0)
    }
}
