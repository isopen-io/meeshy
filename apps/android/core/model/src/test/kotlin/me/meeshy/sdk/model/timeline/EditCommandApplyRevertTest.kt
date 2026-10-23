package me.meeshy.sdk.model.timeline

import me.meeshy.sdk.model.scene.ClipTransform
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryClipTransition
import me.meeshy.sdk.model.StoryEasing
import me.meeshy.sdk.model.StoryKeyframe
import me.meeshy.sdk.model.StoryTransitionKind
import org.junit.Assert.assertThrows
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class EditCommandApplyRevertTest {

    private val project = sampleProject()

    private fun assertRoundTrip(command: EditCommand, on: TimelineProject = project): TimelineProject {
        val applied = command.apply(on)
        assertThat(applied).isNotEqualTo(on)
        assertThat(command.revert(applied)).isEqualTo(on)
        return applied
    }

    @Test
    fun `addClip ajoute un media et se revoque`() {
        val applied = assertRoundTrip(
            AddClipCommand(clipId = "n", postMediaId = "pm", kind = TimelineClipKind.VIDEO, startTime = 1f, duration = 2f, aspectRatio = 1.5),
        )
        assertThat(applied.mediaObjects.last().mediaType).isEqualTo("video")
        assertThat(applied.mediaObjects.last().aspectRatio).isEqualTo(1.5)
    }

    @Test
    fun `addClip couvre audio et texte`() {
        assertRoundTrip(AddClipCommand(clipId = "n", postMediaId = "pm", kind = TimelineClipKind.AUDIO, startTime = 0f, duration = 1f))
        val text = assertRoundTrip(
            AddClipCommand(clipId = "n", postMediaId = "", kind = TimelineClipKind.TEXT, startTime = 0f, duration = 1f, content = "yo"),
        )
        assertThat(text.textObjects.last().text).isEqualTo("yo")
    }

    @Test
    fun `addClip refuse sticker et lieu`() {
        listOf(TimelineClipKind.STICKER, TimelineClipKind.PLACE).forEach { kind ->
            val command = AddClipCommand(clipId = "n", postMediaId = "", kind = kind, startTime = 0f, duration = 1f)
            assertThrows(EditCommandError.InvalidState::class.java) { command.apply(project) }
            assertThrows(EditCommandError.InvalidState::class.java) { command.revert(project) }
        }
    }

    @Test
    fun `deleteClip retire et reinsere au meme rang`() {
        val command = DeleteClipCommand(
            clipId = "v1", kind = TimelineClipKind.VIDEO, snapshotMedia = project.mediaObjects[0], insertionIndex = 0,
        )
        assertThat(assertRoundTrip(command).mediaObjects.map { it.id }).containsExactly("i1")
        assertRoundTrip(DeleteClipCommand(clipId = "a1", kind = TimelineClipKind.AUDIO, snapshotAudio = project.audioPlayerObjects[0], insertionIndex = 0))
        assertRoundTrip(DeleteClipCommand(clipId = "t1", kind = TimelineClipKind.TEXT, snapshotText = project.textObjects[0], insertionIndex = 0))
    }

    @Test
    fun `deleteClip signale un clip introuvable et un instantane manquant`() {
        val ghost = DeleteClipCommand(clipId = "zz", kind = TimelineClipKind.IMAGE, insertionIndex = 0)
        assertThrows(EditCommandError.ClipNotFound::class.java) { ghost.apply(project) }
        assertThrows(EditCommandError.InvalidState::class.java) { ghost.revert(project) }
        val sticker = DeleteClipCommand(clipId = "s1", kind = TimelineClipKind.STICKER, insertionIndex = 0)
        assertThrows(EditCommandError.InvalidState::class.java) { sticker.apply(project) }
    }

    @Test
    fun `moveClip couvre les six familles`() {
        mapOf(
            "v1" to TimelineClipKind.VIDEO, "i1" to TimelineClipKind.IMAGE, "a1" to TimelineClipKind.AUDIO,
            "t1" to TimelineClipKind.TEXT, "s1" to TimelineClipKind.STICKER, "p1" to TimelineClipKind.PLACE,
        ).forEach { (id, kind) ->
            val start = when (id) { "v1", "s1", "p1" -> 1f; "a1" -> 2f; "t1" -> 0.5f; else -> 0f }
            assertRoundTrip(MoveClipCommand(clipId = id, kind = kind, oldStartTime = start, newStartTime = start + 3f))
        }
    }

    @Test
    fun `moveClip sur un clip introuvable leve ClipNotFound`() {
        val command = MoveClipCommand(clipId = "zz", kind = TimelineClipKind.TEXT, oldStartTime = 0f, newStartTime = 1f)
        assertThat(runCatching { command.apply(project) }.exceptionOrNull()).isEqualTo(EditCommandError.ClipNotFound("zz"))
    }

    @Test
    fun `trimClip couvre les six familles`() {
        mapOf(
            "v1" to (TimelineClipKind.VIDEO to (1f to 4f)), "i1" to (TimelineClipKind.IMAGE to (0f to 3f)),
            "a1" to (TimelineClipKind.AUDIO to (2f to 4f)), "t1" to (TimelineClipKind.TEXT to (0.5f to 2f)),
            "s1" to (TimelineClipKind.STICKER to (1f to 2f)), "p1" to (TimelineClipKind.PLACE to (1f to 2f)),
        ).forEach { (id, spec) ->
            val (kind, window) = spec
            assertRoundTrip(
                TrimClipCommand(
                    clipId = id, kind = kind, oldStartTime = window.first, oldDuration = window.second,
                    newStartTime = window.first + 0.25f, newDuration = window.second - 0.5f,
                ),
            )
        }
    }

    @Test
    fun `splitClip scinde en deux moities et se recolle exactement`() {
        val media = SplitClipCommand(clipId = "v1", kind = TimelineClipKind.VIDEO, splitAtRelativeTime = 1.5f, leftId = "l", rightId = "r")
        val applied = assertRoundTrip(media)
        assertThat(applied.mediaObjects.map { it.id }).containsExactly("l", "r", "i1").inOrder()
        assertThat(applied.mediaObjects[1].startTime).isEqualTo(2.5)
        assertThat(applied.mediaObjects[1].duration).isEqualTo(2.5)
        assertRoundTrip(SplitClipCommand(clipId = "a1", kind = TimelineClipKind.AUDIO, splitAtRelativeTime = 1f, leftId = "l", rightId = "r"))
        assertRoundTrip(SplitClipCommand(clipId = "t1", kind = TimelineClipKind.TEXT, splitAtRelativeTime = 0.5f, leftId = "l", rightId = "r"))
    }

    @Test
    fun `splitClip refuse sticker et lieu et signale un clip introuvable`() {
        val sticker = SplitClipCommand(clipId = "s1", kind = TimelineClipKind.STICKER, splitAtRelativeTime = 1f, leftId = "l", rightId = "r")
        assertThrows(EditCommandError.InvalidState::class.java) { sticker.apply(project) }
        val ghost = SplitClipCommand(clipId = "zz", kind = TimelineClipKind.TEXT, splitAtRelativeTime = 1f, leftId = "l", rightId = "r")
        assertThrows(EditCommandError.ClipNotFound::class.java) { ghost.apply(project) }
        assertThrows(EditCommandError.ClipNotFound::class.java) { ghost.revert(project) }
    }

    @Test
    fun `les trois commandes de transition font l aller retour et signalent l introuvable`() {
        val added = StoryClipTransition(id = "tr2", fromClipId = "i1", toClipId = "v1", duration = 1f)
        assertRoundTrip(AddTransitionCommand(transition = added))
        assertRoundTrip(RemoveTransitionCommand(transitionId = "tr1", snapshot = project.clipTransitions[0], insertionIndex = 0))
        val changed = project.clipTransitions[0].copy(kind = StoryTransitionKind.DISSOLVE, duration = 2f)
        assertRoundTrip(ChangeTransitionCommand(transitionId = "tr1", previous = project.clipTransitions[0], updated = changed))
        val ghost = RemoveTransitionCommand(transitionId = "zz", snapshot = added, insertionIndex = 0)
        assertThrows(EditCommandError.TransitionNotFound::class.java) { ghost.apply(project) }
        assertThrows(EditCommandError.TransitionNotFound::class.java) {
            ChangeTransitionCommand(transitionId = "zz", previous = added, updated = added).apply(project)
        }
    }

    @Test
    fun `addKeyframe et deleteKeyframe font l aller retour y compris sur un clip sans keyframe`() {
        val kf = StoryKeyframe(id = "k9", time = 0.5f, opacity = 0.4)
        assertRoundTrip(AddKeyframeCommand(clipId = "v1", kind = TimelineClipKind.VIDEO, keyframe = kf))
        val onBare = assertRoundTrip(AddKeyframeCommand(clipId = "t1", kind = TimelineClipKind.TEXT, keyframe = kf))
        assertThat(onBare.textObjects[0].keyframes).hasSize(1)
        assertRoundTrip(AddKeyframeCommand(clipId = "a1", kind = TimelineClipKind.AUDIO, keyframe = kf))
        val snapshot = project.mediaObjects[0].keyframes!![0]
        val deleted = assertRoundTrip(DeleteKeyframeCommand(clipId = "v1", kind = TimelineClipKind.VIDEO, keyframeId = "k1", snapshot = snapshot, insertionIndex = 0))
        assertThat(deleted.mediaObjects[0].keyframes).isNull()
    }

    @Test
    fun `les keyframes refusent sticker et lieu et signalent le keyframe introuvable`() {
        val kf = StoryKeyframe(id = "k9")
        assertThrows(EditCommandError.InvalidState::class.java) {
            AddKeyframeCommand(clipId = "s1", kind = TimelineClipKind.STICKER, keyframe = kf).apply(project)
        }
        assertThrows(EditCommandError.KeyframeNotFound::class.java) {
            MoveKeyframeCommand(clipId = "v1", kind = TimelineClipKind.VIDEO, keyframeId = "zz", oldTime = 0f, newTime = 1f).apply(project)
        }
        assertThrows(EditCommandError.KeyframeNotFound::class.java) {
            DeleteKeyframeCommand(clipId = "v1", kind = TimelineClipKind.VIDEO, keyframeId = "zz", snapshot = kf, insertionIndex = 0).apply(project)
        }
    }

    @Test
    fun `moveKeyframe ne touche que les axes dont les deux cotes sont presents`() {
        val command = MoveKeyframeCommand(
            clipId = "v1", kind = TimelineClipKind.VIDEO, keyframeId = "k1", oldTime = 1f, newTime = 2f,
            oldScale = 1.0, newScale = 2.0, oldX = null, newX = 0.9, oldEasing = StoryEasing.LINEAR, newEasing = StoryEasing.EASE_IN,
        )
        val applied = assertRoundTrip(command)
        val kf = applied.mediaObjects[0].keyframes!![0]
        assertThat(kf.time).isEqualTo(2f)
        assertThat(kf.scale).isEqualTo(2.0)
        assertThat(kf.x).isEqualTo(0.2)
        assertThat(kf.easing).isEqualTo(StoryEasing.EASE_IN)
    }

    @Test
    fun `setClipProperty couvre media audio et texte`() {
        fun media(p: ClipProperty) = SetClipPropertyCommand(clipId = "v1", kind = TimelineClipKind.VIDEO, property = p)
        assertRoundTrip(media(ClipProperty.FadeIn(null, 0.5)))
        assertRoundTrip(media(ClipProperty.FadeOut(null, 0.5)))
        assertRoundTrip(media(ClipProperty.Loop(false, true)))
        assertRoundTrip(media(ClipProperty.IsBackground(false, true)))
        assertRoundTrip(media(ClipProperty.IsDuckingDisabled(null, true)))
        assertRoundTrip(media(ClipProperty.Name(null, "Intro")))
        assertRoundTrip(media(ClipProperty.Transform(ClipTransform.IDENTITY, ClipTransform(0.1, 0.2, 2.0, 45.0, 3))))
        assertRoundTrip(SetClipPropertyCommand(clipId = "a1", kind = TimelineClipKind.AUDIO, property = ClipProperty.Name(null, "Voix")))
        assertRoundTrip(SetClipPropertyCommand(clipId = "t1", kind = TimelineClipKind.TEXT, property = ClipProperty.IsLocked(null, true)))
        assertRoundTrip(SetClipPropertyCommand(clipId = "t1", kind = TimelineClipKind.TEXT, property = ClipProperty.Transform(ClipTransform(0.5, 0.5, 1.0, 0.0, 0), ClipTransform(0.9, 0.9, 1.0, 0.0, 1))))
    }

    @Test
    fun `muter memorise le niveau et l annulation le restitue exactement`() {
        val mute = SetClipPropertyCommand(clipId = "v1", kind = TimelineClipKind.VIDEO, property = ClipProperty.Volume(old = 0.8f, new = 0f))
        val muted = assertRoundTrip(mute)
        assertThat(muted.mediaObjects[0].volume).isEqualTo(0f)
        assertThat(muted.mediaObjects[0].mutedVolumeMemento).isEqualTo(0.8f)
        val audioMute = SetClipPropertyCommand(clipId = "a1", kind = TimelineClipKind.AUDIO, property = ClipProperty.Volume(0.6f, 0f))
        assertThat(assertRoundTrip(audioMute).audioPlayerObjects[0].mutedVolumeMemento).isEqualTo(0.6f)
    }

    @Test
    fun `setClipProperty refuse sticker et lieu et signale le clip introuvable`() {
        assertThrows(EditCommandError.InvalidState::class.java) {
            SetClipPropertyCommand(clipId = "s1", kind = TimelineClipKind.STICKER, property = ClipProperty.Name(null, "x")).apply(project)
        }
        assertThrows(EditCommandError.ClipNotFound::class.java) {
            SetClipPropertyCommand(clipId = "zz", kind = TimelineClipKind.AUDIO, property = ClipProperty.Name(null, "x")).apply(project)
        }
    }

    @Test
    fun `une propriete sans sens pour la famille est un no-op`() {
        val locked = SetClipPropertyCommand(clipId = "a1", kind = TimelineClipKind.AUDIO, property = ClipProperty.IsLocked(null, true))
        assertThat(locked.apply(project)).isEqualTo(project)
    }

    @Test
    fun `setSlideDuration pose et restitue la duree`() {
        val applied = assertRoundTrip(SetSlideDurationCommand(oldDuration = 10f, newDuration = 20f))
        assertThat(applied.slideDuration).isEqualTo(20f)
    }

    @Test
    fun `la transformation est bornee et ignore les valeurs non finies`() {
        val t = ClipTransform.IDENTITY
        assertThat(t.applying(ClipTransform.Field.X(9.0)).x).isEqualTo(1.5)
        assertThat(t.applying(ClipTransform.Field.Scale(0.0)).scale).isEqualTo(0.05)
        assertThat(t.applying(ClipTransform.Field.Rotation(720.0)).rotation).isEqualTo(180.0)
        assertThat(t.applying(ClipTransform.Field.ZIndex(500)).zIndex).isEqualTo(100)
        assertThat(t.applying(ClipTransform.Field.Y(Double.NaN))).isEqualTo(t)
    }
}
