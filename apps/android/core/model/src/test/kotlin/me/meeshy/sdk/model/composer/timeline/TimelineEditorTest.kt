package me.meeshy.sdk.model.composer.timeline

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryTextObject
import org.junit.Test

class TimelineEditorTest {

    private fun clip(editor: TimelineEditor, id: String) = editor.project.mediaObjects.first { it.id == id }

    @Test
    fun `un tap surligne sans ouvrir la fiche et un double tap l'inspecte`() {
        val editor = editorOf(projectOf(media = listOf(video("a"))))

        val selected = editor.select("a")
        assertThat(selected.selection.selectedClipId).isEqualTo("a")
        assertThat(selected.selection.inspectedClipId).isNull()

        val inspected = selected.inspect("a")
        assertThat(inspected.selection.inspectedClipId).isEqualTo("a")
        assertThat(inspected.endInspection().selection.selectedClipId).isEqualTo("a")
    }

    @Test
    fun `le rognage est limite par la duree native de la source`() {
        val editor = editorOf(projectOf(media = listOf(video("a", 0.0, 2.0, native = 3.0))))

        val trimmed = editor.trimEnd("a", delta = 10f)

        assertThat(clip(trimmed, "a").duration).isWithin(1e-4).of(3.0)
    }

    @Test
    fun `un clip permanent materialise sa fenetre effective pour que ses poignees repondent`() {
        val editor = editorOf(projectOf(text = listOf(StoryTextObject(id = "t", text = "x", startTime = 2.0)), slideDuration = 10f))

        assertThat(editor.window("t")).isEqualTo(ClipWindowResolver.Window(2f, 8f))
        val trimmed = editor.trimEnd("t", delta = -3f)
        assertThat(trimmed.project.textObjects.single().duration).isWithin(1e-4).of(5.0)
        assertThat(trimmed.stack.size).isEqualTo(1)
    }

    @Test
    fun `un reglage sans effet n'empile aucune annulation`() {
        val editor = editorOf(projectOf(media = listOf(video("a", 1.0, 4.0))))

        assertThat(editor.setStart("a", 1f).stack.size).isEqualTo(0)
    }

    @Test
    fun `le volume et les fondus s'appliquent et s'annulent`() {
        val editor = editorOf(projectOf(media = listOf(video("a"))))

        val tuned = editor.setVolume("a", 0.4f).setFadeIn("a", 0.5f).setFadeOut("a", 1f)
        assertThat(clip(tuned, "a").volume).isEqualTo(0.4f)
        assertThat(clip(tuned, "a").fadeIn).isEqualTo(0.5)
        assertThat(clip(tuned, "a").fadeOut).isEqualTo(1.0)

        assertThat(clip(tuned.undo().undo().undo(), "a").volume).isEqualTo(1f)
    }

    @Test
    fun `couper le son memorise le niveau et le rendre le restaure`() {
        val muted = editorOf(projectOf(media = listOf(video("a")))).setVolume("a", 0.6f).toggleMute("a")
        assertThat(clip(muted, "a").volume).isEqualTo(0f)

        assertThat(clip(muted.toggleMute("a"), "a").volume).isEqualTo(0.6f)
    }

    @Test
    fun `scinder coupe le clip selectionne a la tete de lecture`() {
        val ids = ArrayDeque(listOf("l", "r"))
        val split = editorOf(projectOf(media = listOf(video("a", 1.0, 4.0))))
            .select("a").scrub(3f).splitSelectedAtPlayhead { ids.removeFirst() }

        assertThat(split.project.mediaObjects.map { it.id }).containsExactly("l", "r").inOrder()
        assertThat(clip(split, "l").duration).isWithin(1e-4).of(2.0)
        assertThat(clip(split, "r").startTime).isWithin(1e-4).of(3.0)
    }

    @Test
    fun `supprimer un clip le deselectionne et la duree retombe sur le contenu`() {
        val editor = editorOf(projectOf(media = listOf(video("a", 0.0, 12.0)), slideDuration = 12f))

        val deleted = editor.select("a").deleteClip("a")

        assertThat(deleted.project.mediaObjects).isEmpty()
        assertThat(deleted.selection.selectedClipId).isNull()
        assertThat(deleted.project.slideDuration).isWithin(1e-4f).of(6f)
        assertThat(deleted.durationNotice).isEqualTo(DurationNotice(12f, 6f))
    }

    @Test
    fun `plus dix secondes allonge, survit a l'edition suivante et s'annule`() {
        val editor = editorOf(projectOf(media = listOf(video("a", 0.0, 4.0)), slideDuration = 6f))

        val extended = editor.extendSlideDuration()
        assertThat(extended.project.slideDuration).isWithin(1e-4f).of(16f)

        val edited = extended.nudgeStart("a", 1f)
        assertThat(edited.project.slideDuration).isWithin(1e-4f).of(16f)

        val undone = extended.undo()
        assertThat(undone.project.slideDuration).isWithin(1e-4f).of(6f)
        assertThat(undone.authoredSlideDuration).isNull()
        assertThat(undone.redo().project.slideDuration).isWithin(1e-4f).of(16f)
    }

    @Test
    fun `plus dix secondes est plafonne au maximum de la timeline`() {
        val editor = editorOf(projectOf(media = listOf(video("a")), slideDuration = 595f)).extendSlideDuration()

        assertThat(editor.project.slideDuration).isEqualTo(ClipWindowResolver.MAXIMUM_END)
        assertThat(editor.extendSlideDuration().stack.size).isEqualTo(1)
    }

    @Test
    fun `un contenu plus long que la demande d'auteur l'emporte`() {
        val editor = editorOf(projectOf(media = listOf(video("a", 0.0, 4.0)), slideDuration = 6f))
            .extendSlideDuration(2f)
            .setDuration("a", 20f)

        assertThat(editor.project.slideDuration).isWithin(1e-4f).of(20f)
    }

    @Test
    fun `une duree deja epinglee au dessus du contenu devient la demande d'auteur a l'ouverture`() {
        val opened = editorOf(projectOf(media = listOf(video("a", 0.0, 4.0)), slideDuration = 15f))

        assertThat(opened.authoredSlideDuration).isEqualTo(15f)
    }

    @Test
    fun `le son se rogne comme un media`() {
        val audio = StoryAudioPlayerObject(id = "m", startTime = 1f, duration = 6f)
        val trimmed = editorOf(projectOf(audio = listOf(audio))).trimStart("m", delta = 2f)

        assertThat(trimmed.project.audioPlayerObjects.single().startTime).isWithin(1e-4f).of(3f)
        assertThat(trimmed.project.audioPlayerObjects.single().duration).isWithin(1e-4f).of(4f)
    }
}
