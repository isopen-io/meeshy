package me.meeshy.sdk.model.composer.sound

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryAudioPlayerObject
import org.junit.Test

class ComposerSoundPlacementTest {
    private fun sound(id: String, title: String = "T$id") = ApiSound(
        id = id, title = title, fileUrl = "https://cdn/$id.m4a", durationMs = 6000,
        uploader = ApiSoundUploader("u", "ana"),
    )

    private fun recording(id: String, background: Boolean? = true) =
        StoryAudioPlayerObject(id = id, postMediaId = "pm", isBackground = background)

    @Test
    fun `borrowing carries the shelf identity so the author keeps their credit`() {
        val placed = ComposerSoundPlacement.borrow(emptyList(), sound("s1")) as SoundPlacement.Placed
        val track = placed.audios.single()
        assertThat(track.soundId).isEqualTo("s1")
        assertThat(track.mediaURL).isEqualTo("https://cdn/s1.m4a")
        assertThat(track.soundAuthorUsername).isEqualTo("ana")
        assertThat(track.isBackground).isTrue()
        assertThat(track.postMediaId).isEmpty()
        assertThat(track.duration).isEqualTo(6f)
    }

    @Test
    fun `a new background replaces the borrowed one in place and never stacks two backgrounds`() {
        val first = (ComposerSoundPlacement.borrow(emptyList(), sound("s1")) as SoundPlacement.Placed).audios
        val second = (ComposerSoundPlacement.borrow(first, sound("s2")) as SoundPlacement.Placed).audios
        assertThat(second.map { it.soundId }).containsExactly("s2")
    }

    @Test
    fun `a captured background is kept as a foreground track rather than lost`() {
        val placed = ComposerSoundPlacement.borrow(listOf(recording("rec")), sound("s1")) as SoundPlacement.Placed
        assertThat(placed.audios.map { it.id }).containsExactly("rec", "borrowed-s1").inOrder()
        assertThat(placed.audios.first { it.id == "rec" }.isBackground).isFalse()
        assertThat(ComposerSoundPlacement.background(placed.audios)!!.soundId).isEqualTo("s1")
    }

    @Test
    fun `borrowing the sound already in the background changes nothing`() {
        val first = (ComposerSoundPlacement.borrow(emptyList(), sound("s1")) as SoundPlacement.Placed).audios
        assertThat(ComposerSoundPlacement.borrow(first, sound("s1"))).isEqualTo(SoundPlacement.Placed(first))
    }

    @Test
    fun `the scene refuses a fifty-first audio track with a named reason`() {
        val full = (1..50).map { recording("r$it", background = false) }
        assertThat(ComposerSoundPlacement.borrow(full, sound("s1"))).isEqualTo(SoundPlacement.Refused)
        assertThat(ComposerSoundPlacement.borrow(full.take(49), sound("s1"))).isInstanceOf(SoundPlacement.Placed::class.java)
    }

    @Test
    fun `visual media no longer take the place of sounds`() {
        assertThat(ComposerSoundPlacement.canBorrow(emptyList(), visualMedia = 50)).isTrue()
        assertThat(ComposerSoundPlacement.borrow(emptyList(), sound("s1"), visualMedia = 50)).isInstanceOf(SoundPlacement.Placed::class.java)
    }

    @Test
    fun `the refusal names the sound cap, the only one that gates a sound`() {
        val full = (1..50).map { recording("r$it", background = false) }
        assertThat(ComposerSoundPlacement.borrowRefusal(full, visualMedia = 0))
            .isEqualTo(me.meeshy.sdk.model.composer.SceneObjectCaps.Reason.AUDIO_FULL)
        assertThat(ComposerSoundPlacement.borrowRefusal(full, visualMedia = 50))
            .isEqualTo(me.meeshy.sdk.model.composer.SceneObjectCaps.Reason.AUDIO_FULL)
        assertThat(ComposerSoundPlacement.borrowRefusal(full.take(49), visualMedia = 50)).isNull()
    }

    @Test
    fun `removing a sound on a full scene frees the place again`() {
        val full = (1..50).map { recording("r$it", background = false) }
        assertThat(ComposerSoundPlacement.canBorrow(full, visualMedia = 7)).isFalse()
        val freed = ComposerSoundPlacement.remove(full, "r2")
        assertThat(ComposerSoundPlacement.canBorrow(freed, visualMedia = 7)).isTrue()
        assertThat(ComposerSoundPlacement.borrow(freed, sound("s1"), visualMedia = 7)).isInstanceOf(SoundPlacement.Placed::class.java)
    }

    @Test
    fun `a borrowed background is replaced even on a scene at the ten cap`() {
        val borrowed = (ComposerSoundPlacement.borrow(emptyList(), sound("s0")) as SoundPlacement.Placed).audios
        assertThat(ComposerSoundPlacement.canBorrow(borrowed, visualMedia = 9)).isTrue()
        assertThat(ComposerSoundPlacement.borrow(borrowed, sound("s1"), visualMedia = 9)).isInstanceOf(SoundPlacement.Placed::class.java)
    }

    @Test
    fun `removing and muting target a track by id and leave the others`() {
        val audios = listOf(recording("a"), recording("b", background = false))
        assertThat(ComposerSoundPlacement.remove(audios, "a").map { it.id }).containsExactly("b")
        assertThat(ComposerSoundPlacement.remove(audios, "zz")).isEqualTo(audios)
        val muted = ComposerSoundPlacement.toggleMute(audios, "b")
        assertThat(muted.first { it.id == "b" }.isMuted).isTrue()
        assertThat(muted.first { it.id == "a" }.isMuted).isFalse()
        assertThat(ComposerSoundPlacement.toggleMute(muted, "b").first { it.id == "b" }.isMuted).isFalse()
    }

    @Test
    fun `the background is heard while composing only with the screen in front, unmuted, and the shelf closed`() {
        val track = StoryAudioPlayerObject(id = "a", mediaURL = "https://cdn/a.m4a", isBackground = true)
        assertThat(ComposerSoundPlacement.playsWhileComposing(track, screenResumed = true, shelfOpen = false)).isTrue()
        assertThat(ComposerSoundPlacement.playsWhileComposing(track, screenResumed = false, shelfOpen = false)).isFalse()
        assertThat(ComposerSoundPlacement.playsWhileComposing(track, screenResumed = true, shelfOpen = true)).isFalse()
        assertThat(ComposerSoundPlacement.playsWhileComposing(toggleMuted(track), true, false)).isFalse()
        assertThat(ComposerSoundPlacement.playsWhileComposing(track.copy(mediaURL = null), true, false)).isFalse()
        assertThat(ComposerSoundPlacement.playsWhileComposing(null, true, false)).isFalse()
    }

    private fun toggleMuted(track: StoryAudioPlayerObject) = ComposerSoundPlacement.toggleMute(listOf(track), track.id).single()

    @Test
    fun `the trace shows the background only while no tool owns the low zone`() {
        val bg = recording("a")
        assertThat(ComposerSoundPlacement.traceServed(bg, toolIsOpen = false)).isEqualTo(bg)
        assertThat(ComposerSoundPlacement.traceServed(bg, toolIsOpen = true)).isNull()
        assertThat(ComposerSoundPlacement.traceServed(null, toolIsOpen = false)).isNull()
    }

    @Test
    fun `the resolved background is the first flagged track, a legacy one without object is not removable`() {
        val audios = listOf(recording("a", background = false), recording("b"))
        assertThat(ComposerSoundPlacement.background(audios)!!.id).isEqualTo("b")
        assertThat(ComposerSoundPlacement.supersededId(null, audios)).isNull()
        assertThat(ComposerSoundPlacement.supersededId(recording("ghost"), audios)).isNull()
        assertThat(ComposerSoundPlacement.supersededId(audios[1], audios)).isEqualTo("b")
    }
}
