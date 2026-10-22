package me.meeshy.sdk.model.composer.timeline

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.timeline.ClipWindowResolver.Edit
import me.meeshy.sdk.model.composer.timeline.ClipWindowResolver.Window
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class ClipWindowResolverTest {

    private val clip = Window(start = 2f, duration = 3f)

    private fun resolve(edit: Edit, from: Window = clip) = ClipWindowResolver.resolve(edit, from)

    @Test
    fun `deplacer garde la duree et ne passe jamais sous zero`() {
        assertThat(resolve(Edit.Move(-4f))).isEqualTo(Window(0f, 3f))
        assertThat(resolve(Edit.Move(7f))).isEqualTo(Window(7f, 3f))
    }

    @Test
    fun `deplacer ne depasse pas le plafond de la timeline`() {
        assertThat(resolve(Edit.Move(900f))).isEqualTo(Window(597f, 3f))
    }

    @Test
    fun `regler le debut garde la fin fixe`() {
        assertThat(resolve(Edit.SetStart(1f))).isEqualTo(Window(1f, 4f))
    }

    @Test
    fun `regler le debut au dela de la fin laisse la duree minimale`() {
        val result = resolve(Edit.SetStart(99f))
        assertThat(result.end).isWithin(1e-4f).of(5f)
        assertThat(result.duration).isWithin(1e-4f).of(ClipWindowResolver.MINIMUM_DURATION)
    }

    @Test
    fun `regler le debut negatif le ramene a zero en gardant la fin`() {
        assertThat(resolve(Edit.SetStart(-3f))).isEqualTo(Window(0f, 5f))
    }

    @Test
    fun `regler la fin garde le debut fixe`() {
        assertThat(resolve(Edit.SetEnd(10f))).isEqualTo(Window(2f, 8f))
    }

    @Test
    fun `regler la fin avant le debut laisse la duree minimale`() {
        val result = resolve(Edit.SetEnd(0f))
        assertThat(result.start).isEqualTo(2f)
        assertThat(result.duration).isWithin(1e-4f).of(ClipWindowResolver.MINIMUM_DURATION)
    }

    @Test
    fun `un clip finissant en fin de slide peut toujours s allonger`() {
        val atEnd = Window(start = 9f, duration = 3f)
        assertThat(resolve(Edit.SetEnd(20f), atEnd).end).isEqualTo(20f)
        assertThat(resolve(Edit.SetDuration(10f), atEnd).duration).isEqualTo(10f)
    }

    @Test
    fun `regler la duree est borne par le minimum et le plafond`() {
        assertThat(resolve(Edit.SetDuration(0f)).duration).isEqualTo(ClipWindowResolver.MINIMUM_DURATION)
        assertThat(resolve(Edit.SetDuration(5000f)).end).isEqualTo(ClipWindowResolver.MAXIMUM_END)
    }

    @Test
    fun `une valeur non finie laisse la fenetre intacte`() {
        listOf(Edit.Move(Float.NaN), Edit.SetStart(Float.POSITIVE_INFINITY), Edit.SetEnd(Float.NaN), Edit.SetDuration(Float.NEGATIVE_INFINITY))
            .forEach { assertThat(resolve(it)).isEqualTo(clip) }
    }

    @Test
    fun `quelle que soit l edition l etat reste valide`() {
        val values = listOf(-50f, -1f, 0f, 0.01f, 1f, 5f, 599f, 600f, 1000f)
        for (v in values) {
            listOf(Edit.Move(v), Edit.SetStart(v), Edit.SetEnd(v), Edit.SetDuration(v)).forEach { edit ->
                val w = resolve(edit)
                assertThat(w.start).isAtLeast(0f)
                assertThat(w.duration).isAtLeast(ClipWindowResolver.MINIMUM_DURATION - 1e-6f)
                assertThat(w.end).isAtMost(ClipWindowResolver.MAXIMUM_END + 1e-3f)
            }
        }
    }
}
