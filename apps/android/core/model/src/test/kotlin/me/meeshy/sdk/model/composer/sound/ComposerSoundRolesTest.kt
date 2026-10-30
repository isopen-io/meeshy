package me.meeshy.sdk.model.composer.sound

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryObjectPlacement
import me.meeshy.sdk.model.composer.SceneObjectCaps
import org.junit.Test

class ComposerSoundRolesTest {
    private val landing = StoryObjectPlacement.Point(0.56, 0.56)

    private fun captured(id: String, background: Boolean? = null) =
        StoryAudioPlayerObject(id = id, postMediaId = "pm-$id", mediaURL = "https://cdn/$id.m4a", isBackground = background)

    private fun borrowed(id: String) =
        StoryAudioPlayerObject(id = id, postMediaId = "", soundId = "s-$id", mediaURL = "https://cdn/$id.m4a", isBackground = true)

    @Test
    fun `a slide without a background sound takes the new one as its background`() {
        assertThat(ComposerSoundRoles.automatic(emptyList())).isEqualTo(ComposerAudioRole.BACKGROUND)
        assertThat(ComposerSoundRoles.automatic(listOf(captured("a", background = true)))).isEqualTo(ComposerAudioRole.FOREGROUND)
    }

    @Test
    fun `a sound placed on the scene keeps no background flag and lands where nothing is posed`() {
        val placed = ComposerSoundRoles.place(emptyList(), captured("a", background = true), ComposerAudioRole.FOREGROUND, landing)
        val track = (placed as SoundPlacement.Placed).audios.single()
        assertThat(track.isBackground).isNull()
        assertThat(track.x).isEqualTo(0.56)
        assertThat(track.y).isEqualTo(0.56)
    }

    @Test
    fun `a new background supersedes a borrowed one and demotes a captured one`() {
        val overBorrowed = ComposerSoundRoles.place(listOf(borrowed("b")), captured("n"), ComposerAudioRole.BACKGROUND, landing)
        assertThat((overBorrowed as SoundPlacement.Placed).audios.map { it.id }).containsExactly("n")
        val overCaptured = ComposerSoundRoles.place(listOf(captured("old", background = true)), captured("n"), ComposerAudioRole.BACKGROUND, landing)
        val audios = (overCaptured as SoundPlacement.Placed).audios
        assertThat(audios.map { it.id }).containsExactly("old", "n").inOrder()
        assertThat(ComposerSoundPlacement.background(audios)!!.id).isEqualTo("n")
    }

    @Test
    fun `placing beyond the fifty sounds of a scene is refused`() {
        val full = List(SceneObjectCaps.AUDIO) { captured("c$it") }
        assertThat(ComposerSoundRoles.place(full, captured("n"), ComposerAudioRole.FOREGROUND, landing)).isEqualTo(SoundPlacement.Refused)
    }

    @Test
    fun `moving the background onto the scene keeps the track and gives it a place`() {
        val audios = listOf(captured("a", background = true))
        val moved = ComposerSoundRoles.withRole(audios, "a", ComposerAudioRole.FOREGROUND, landing)
        assertThat(moved.single().isBackground).isNull()
        assertThat(moved.single().x).isEqualTo(0.56)
        assertThat(ComposerSoundRoles.withRole(audios, "a", ComposerAudioRole.BACKGROUND, landing)).isSameInstanceAs(audios)
    }

    @Test
    fun `making a scene sound the background demotes the previous captured background`() {
        val audios = listOf(captured("bg", background = true), captured("fg"))
        val swapped = ComposerSoundRoles.withRole(audios, "fg", ComposerAudioRole.BACKGROUND, landing)
        assertThat(ComposerSoundPlacement.background(swapped)!!.id).isEqualTo("fg")
        assertThat(swapped.first { it.id == "bg" }.isBackground).isNotEqualTo(true)
        assertThat(swapped).hasSize(2)
    }

    @Test
    fun `setting a volume clamps it and lifts a mute`() {
        val muted = listOf(captured("a").copy(volume = 0f, mutedVolumeMemento = 0.7f))
        val raised = ComposerSoundRoles.withVolume(muted, "a", 1.4f).single()
        assertThat(raised.volume).isEqualTo(1f)
        assertThat(raised.mutedVolumeMemento).isNull()
        assertThat(ComposerSoundRoles.withVolume(muted, "a", -1f).single().volume).isEqualTo(0f)
    }

    @Test
    fun `the language of a sound is written on its track`() {
        val audios = listOf(captured("a"))
        assertThat(ComposerSoundRoles.withLanguage(audios, "a", "PT").single().sourceLanguage).isEqualTo("pt")
        assertThat(ComposerSoundRoles.withLanguage(audios, "missing", "pt")).isSameInstanceAs(audios)
    }
}
