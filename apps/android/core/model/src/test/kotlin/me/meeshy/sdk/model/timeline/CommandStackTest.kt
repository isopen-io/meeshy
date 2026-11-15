package me.meeshy.sdk.model.timeline

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class CommandStackTest {

    private fun move(clip: String = "c", from: Float, to: Float, at: Long, kind: TimelineClipKind = TimelineClipKind.TEXT) =
        MoveClipCommand(id = "m$at", timestamp = at, clipId = clip, kind = kind, oldStartTime = from, newStartTime = to)

    private fun setDuration(at: Long, to: Float) = SetSlideDurationCommand(id = "d$at", timestamp = at, oldDuration = 1f, newDuration = to)

    private fun stackOf(vararg commands: EditCommand) = commands.fold(CommandStack()) { s, c -> s.push(c) }

    @Test
    fun `une pile neuve n a rien a annuler ni a retablir`() {
        val stack = CommandStack()
        assertThat(stack.canUndo).isFalse()
        assertThat(stack.canRedo).isFalse()
        assertThat(stack.undo()).isNull()
        assertThat(stack.redo()).isNull()
    }

    @Test
    fun `annuler puis retablir rejoue la meme commande`() {
        val first = setDuration(at = 0, to = 2f)
        val second = setDuration(at = 10_000, to = 3f)
        val stack = stackOf(first, second)
        val undone = stack.undo()!!
        assertThat(undone.command).isEqualTo(second)
        assertThat(undone.stack.canRedo).isTrue()
        assertThat(undone.stack.size).isEqualTo(2)
        assertThat(undone.stack.redo()!!.command).isEqualTo(second)
        assertThat(undone.stack.undo()!!.stack.canUndo).isFalse()
    }

    @Test
    fun `une nouvelle commande apres un annuler vide la branche retablir`() {
        val stack = stackOf(setDuration(0, 2f), setDuration(10_000, 3f)).undo()!!.stack
        val next = stack.push(setDuration(20_000, 9f))
        assertThat(next.canRedo).isFalse()
        assertThat(next.size).isEqualTo(2)
    }

    @Test
    fun `le plafond evince les plus anciennes`() {
        val stack = (1..5).fold(CommandStack(maxSize = 3)) { s, i -> s.push(setDuration(i * 10_000L, i.toFloat())) }
        assertThat(stack.size).isEqualTo(3)
        assertThat((stack.commands.first() as SetSlideDurationCommand).newDuration).isEqualTo(3f)
    }

    @Test
    fun `un geste de deplacement coalesce en une seule entree qui revient avant le geste`() {
        val stack = stackOf(move(from = 0f, to = 1f, at = 0), move(from = 1f, to = 2f, at = 100), move(from = 2f, to = 3f, at = 200))
        assertThat(stack.size).isEqualTo(1)
        val merged = stack.commands.single() as MoveClipCommand
        assertThat(merged.oldStartTime).isEqualTo(0f)
        assertThat(merged.newStartTime).isEqualTo(3f)
    }

    @Test
    fun `hors fenetre ou autre cible rien ne coalesce`() {
        assertThat(stackOf(move(from = 0f, to = 1f, at = 0), move(from = 1f, to = 2f, at = 900)).size).isEqualTo(2)
        assertThat(stackOf(move("a", 0f, 1f, 0), move("b", 0f, 1f, 50)).size).isEqualTo(2)
        assertThat(stackOf(move(from = 0f, to = 1f, at = 0), move(from = 0f, to = 1f, at = 50, kind = TimelineClipKind.AUDIO)).size).isEqualTo(2)
    }

    @Test
    fun `le trim coalesce en gardant la fenetre d avant le geste`() {
        fun trim(at: Long, oldS: Float, oldD: Float, newS: Float, newD: Float) = TrimClipCommand(
            id = "t$at", timestamp = at, clipId = "c", kind = TimelineClipKind.VIDEO,
            oldStartTime = oldS, oldDuration = oldD, newStartTime = newS, newDuration = newD,
        )
        val merged = stackOf(trim(0, 0f, 5f, 0f, 4f), trim(100, 0f, 4f, 0f, 3f)).commands.single() as TrimClipCommand
        assertThat(merged.oldDuration).isEqualTo(5f)
        assertThat(merged.newDuration).isEqualTo(3f)
    }

    @Test
    fun `le deplacement de keyframe fusionne les axes sans que l un efface l autre`() {
        fun mk(at: Long, scaleOld: Double?, scaleNew: Double?, opOld: Double?, opNew: Double?) = MoveKeyframeCommand(
            id = "k$at", timestamp = at, clipId = "c", kind = TimelineClipKind.VIDEO, keyframeId = "kf",
            oldTime = 1f, newTime = 1f, oldScale = scaleOld, newScale = scaleNew, oldOpacity = opOld, newOpacity = opNew,
        )
        val merged = stackOf(mk(0, 1.0, 2.0, null, null), mk(100, null, null, 1.0, 0.5)).commands.single() as MoveKeyframeCommand
        assertThat(merged.oldScale).isEqualTo(1.0)
        assertThat(merged.newScale).isEqualTo(2.0)
        assertThat(merged.oldOpacity).isEqualTo(1.0)
        assertThat(merged.newOpacity).isEqualTo(0.5)
    }

    @Test
    fun `un instantane restaure borne le curseur`() {
        val snapshot = CommandStackSnapshot(listOf(setDuration(0, 2f)), cursor = 99)
        assertThat(CommandStack().restoring(snapshot).canRedo).isFalse()
        assertThat(CommandStack().restoring(snapshot.copy(cursor = -4)).canUndo).isFalse()
    }
}
