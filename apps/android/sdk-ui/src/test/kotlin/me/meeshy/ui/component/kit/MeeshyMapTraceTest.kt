package me.meeshy.ui.component.kit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** K54 — le tracé de carte : il relie des points déjà projetés, il ne sait pas par où passer. */
class MeeshyMapTraceTest {

    private fun p(x: Float, y: Float) = MeeshyMapTracePoint(x, y)

    @Test
    fun `sous deux points rien n est dessine`() {
        assertThat(MeeshyMapTracePath.of(listOf(p(0f, 0f)), MeeshyMapTraceKind.Route).isDrawable).isFalse()
        assertThat(MeeshyMapTracePath.of(emptyList(), MeeshyMapTraceKind.Route).isDrawable).isFalse()
    }

    @Test
    fun `sous 24 de longueur a l ecran rien n est dessine`() {
        assertThat(MeeshyMapTracePath.of(listOf(p(0f, 0f), p(23f, 0f)), MeeshyMapTraceKind.Route).isDrawable).isFalse()
        assertThat(MeeshyMapTracePath.of(listOf(p(0f, 0f), p(25f, 0f)), MeeshyMapTraceKind.Route).isDrawable).isTrue()
    }

    @Test
    fun `un point illisible est ecarte`() {
        val path = MeeshyMapTracePath.of(listOf(p(0f, 0f), p(Float.NaN, 5f), p(100f, 0f)), MeeshyMapTraceKind.Route)
        assertThat(path.isDrawable).isTrue()
        assertThat(path.length).isWithin(0.01f).of(100f)
    }

    @Test
    fun `une droite a sa longueur, son milieu et ses fractions`() {
        val path = MeeshyMapTracePath.of(listOf(p(0f, 0f), p(100f, 0f)), MeeshyMapTraceKind.Route)
        assertThat(path.length).isWithin(0.01f).of(100f)
        assertThat(path.midpoint.x).isWithin(0.05f).of(50f)
        assertThat(path.fractions).hasSize(2)
        assertThat(path.fractions[0]).isEqualTo(0f)
        assertThat(path.fractions[1]).isWithin(1e-4f).of(1f)
        assertThat(path.at(0.25f).x).isWithin(0.05f).of(25f)
        assertThat(path.at(-3f).x).isEqualTo(0f)
        assertThat(path.at(9f).x).isWithin(0.05f).of(100f)
    }

    @Test
    fun `un lien ne garde que les deux bouts, en ligne droite`() {
        val link = MeeshyMapTracePath.of(listOf(p(0f, 0f), p(40f, 90f), p(100f, 0f)), MeeshyMapTraceKind.Link)
        assertThat(link.length).isWithin(0.01f).of(100f)
        assertThat(link.segments).hasSize(1)
    }

    @Test
    fun `un chemin lisse passe par chaque point`() {
        val pts = listOf(p(0f, 0f), p(60f, 40f), p(120f, 0f))
        val path = MeeshyMapTracePath.of(pts, MeeshyMapTraceKind.Route)
        assertThat(path.segments).hasSize(2)
        assertThat(path.segments[0].end).isEqualTo(pts[1])
        assertThat(path.segments[1].end).isEqualTo(pts[2])
        assertThat(path.fractions).hasSize(3)
        assertThat(path.fractions[1]).isGreaterThan(0.3f)
        assertThat(path.fractions[1]).isLessThan(0.7f)
        val straight = MeeshyMapTracePath.of(pts, MeeshyMapTraceKind.Route, smoothing = false)
        assertThat(straight.segments[0].c1).isEqualTo(pts[0])
    }

    @Test
    fun `la recette - un trajet coule, un lien pointille mince, une histoire epaisse`() {
        val route = MeeshyMapTraceRecipe.resolve(MeeshyMapTraceKind.Route)
        assertThat(route.flows).isTrue()
        assertThat(route.dotDp).isEqualTo(4f)
        assertThat(route.dotEveryDp).isEqualTo(10f)
        assertThat(route.casingDp).isEqualTo(7f)
        assertThat(MeeshyMapTraceRecipe.resolve(MeeshyMapTraceKind.Route, weight = MeeshyMapTraceWeight.Large).dotEveryDp).isEqualTo(11f)
        assertThat(MeeshyMapTraceRecipe.resolve(MeeshyMapTraceKind.Link).strokeDp).isEqualTo(2.5f)
        assertThat(MeeshyMapTraceRecipe.resolve(MeeshyMapTraceKind.History).strokeDp).isEqualTo(7f)
        assertThat(MeeshyMapTraceRecipe.resolve(MeeshyMapTraceKind.Link).flows).isFalse()
    }

    @Test
    fun `perime il s eteint a 60 pour cent et cesse de couler - mouvement reduit aussi`() {
        val stale = MeeshyMapTraceRecipe.resolve(MeeshyMapTraceKind.Route, isStale = true)
        assertThat(stale.opacity).isEqualTo(0.6f)
        assertThat(stale.flows).isFalse()
        assertThat(MeeshyMapTraceRecipe.resolve(MeeshyMapTraceKind.Route, reduceMotion = true).flows).isFalse()
        assertThat(MeeshyMapTraceRecipe.resolve(MeeshyMapTraceKind.Route, isAnimated = false).flows).isFalse()
    }

    @Test
    fun `le liseré s eclaircit sur une carte claire`() {
        assertThat(MeeshyMapTraceRecipe.resolve(MeeshyMapTraceKind.Route).casingOpacity).isEqualTo(0.55f)
        assertThat(MeeshyMapTraceRecipe.resolve(MeeshyMapTraceKind.Route, onLightMap = true).casingOpacity).isEqualTo(0.7f)
    }

    @Test
    fun `la progression est bornee, la tete n existe qu avec elle, l etiquette de milieu veut 96`() {
        assertThat(MeeshyMapTraceRecipe.resolve(MeeshyMapTraceKind.Route, progress = 1.7f).progress).isEqualTo(1f)
        assertThat(MeeshyMapTraceRecipe.resolve(MeeshyMapTraceKind.Route, progress = Float.NaN).hasHead).isFalse()
        assertThat(MeeshyMapTraceRecipe.resolve(MeeshyMapTraceKind.Route, progress = 0.4f).hasHead).isTrue()
        assertThat(MeeshyMapTraceRecipe.resolve(MeeshyMapTraceKind.Route, length = 80f).showsMidLabel).isFalse()
        assertThat(MeeshyMapTraceRecipe.resolve(MeeshyMapTraceKind.Route, length = 96f).showsMidLabel).isTrue()
        assertThat(MeeshyMapTraceRecipe.resolve(MeeshyMapTraceKind.Route).showsMidLabel).isTrue()
    }
}
