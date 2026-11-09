package me.meeshy.sdk.model.conversationlist

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationPeekSizingTest {

    private fun geometry(
        available: Float = 800f,
        gap: Float = 8f,
        minCard: Float = 120f,
        compactMenu: Float = 100f,
        naturalMenu: Float = 500f,
    ) = ConversationPeekGeometry(
        available = available,
        gap = gap,
        minCard = minCard,
        compactMenu = compactMenu,
        naturalMenu = naturalMenu,
    )

    @Test
    fun `au repos la carte prend la plus grande part et le menu reste compact`() {
        val heights = geometry().heightsAt(progress = 0f)

        assertThat(heights.menu).isEqualTo(100f)
        assertThat(heights.card).isEqualTo(692f)
        assertThat(heights.card).isGreaterThan(heights.menu)
    }

    @Test
    fun `tire jusqu'au bout le menu montre tout et la carte se reduit d'autant`() {
        val heights = geometry().heightsAt(progress = 1f)

        assertThat(heights.menu).isEqualTo(500f)
        assertThat(heights.card).isEqualTo(292f)
    }

    @Test
    fun `a mi-course les deux hauteurs suivent la progression et leur somme ne bouge pas`() {
        val g = geometry()
        val half = g.heightsAt(progress = 0.5f)

        assertThat(half.menu).isEqualTo(300f)
        assertThat(half.card + half.menu + 8f).isEqualTo(800f)
    }

    @Test
    fun `un menu plus haut que l'ecran s'arrete la ou la carte garde son minimum`() {
        val g = geometry(naturalMenu = 2_000f)

        assertThat(g.expandedMenu).isEqualTo(672f)
        assertThat(g.heightsAt(1f).card).isEqualTo(120f)
    }

    @Test
    fun `une progression hors bornes est ramenee entre compact et etendu`() {
        val g = geometry()

        assertThat(g.heightsAt(-0.4f)).isEqualTo(g.heightsAt(0f))
        assertThat(g.heightsAt(1.7f)).isEqualTo(g.heightsAt(1f))
    }

    @Test
    fun `un menu qui tient deja en compact n'a aucune course`() {
        val g = geometry(naturalMenu = 80f)

        assertThat(g.travel).isEqualTo(0f)
        assertThat(g.heightsAt(1f)).isEqualTo(g.heightsAt(0f))
    }

    @Test
    fun `le doigt qui monte fait grandir la progression au prorata de la course`() {
        val g = geometry()

        assertThat(g.progressAfterDrag(progress = 0f, upwardDelta = 100f)).isEqualTo(0.25f)
        assertThat(g.progressAfterDrag(progress = 0.25f, upwardDelta = -100f)).isEqualTo(0f)
    }

    @Test
    fun `revenir en arriere avant de relacher restaure et ne depasse jamais les crans`() {
        val g = geometry()

        val up = g.progressAfterDrag(0f, upwardDelta = 300f)
        val back = g.progressAfterDrag(up, upwardDelta = -300f)

        assertThat(back).isEqualTo(0f)
        assertThat(g.progressAfterDrag(0.9f, upwardDelta = 1_000f)).isEqualTo(1f)
        assertThat(g.progressAfterDrag(0.1f, upwardDelta = -1_000f)).isEqualTo(0f)
    }

    @Test
    fun `sans course aucun glissement ne bouge la progression`() {
        val g = geometry(naturalMenu = 80f)

        assertThat(g.progressAfterDrag(0f, upwardDelta = 500f)).isEqualTo(0f)
    }

    @Test
    fun `relache lentement le cran le plus proche gagne au seuil de mi-course`() {
        val g = geometry()

        assertThat(g.settle(progress = 0.49f, upwardVelocity = 0f)).isEqualTo(PeekMenuDetent.Compact)
        assertThat(g.settle(progress = 0.5f, upwardVelocity = 0f)).isEqualTo(PeekMenuDetent.Expanded)
        assertThat(g.settle(progress = 0.8f, upwardVelocity = -10f)).isEqualTo(PeekMenuDetent.Expanded)
    }

    @Test
    fun `un lancer franc decide selon son sens meme avant le seuil`() {
        val g = geometry()
        val fling = g.travel * ConversationPeekSizing.FLING_TRAVELS_PER_SECOND

        assertThat(g.settle(progress = 0.1f, upwardVelocity = fling)).isEqualTo(PeekMenuDetent.Expanded)
        assertThat(g.settle(progress = 0.9f, upwardVelocity = -fling)).isEqualTo(PeekMenuDetent.Compact)
    }

    @Test
    fun `sans course le menu est toujours etendu puisqu'il montre deja tout`() {
        val g = geometry(naturalMenu = 80f)

        assertThat(g.settle(progress = 0f, upwardVelocity = 0f)).isEqualTo(PeekMenuDetent.Expanded)
    }

    @Test
    fun `les crans se lisent en progression`() {
        assertThat(PeekMenuDetent.Compact.progress).isEqualTo(0f)
        assertThat(PeekMenuDetent.Expanded.progress).isEqualTo(1f)
    }

    @Test
    fun `lecteur d'ecran ou animations reduites ouvrent directement etendu`() {
        assertThat(ConversationPeekSizing.initialDetent(screenReader = false, reduceMotion = false))
            .isEqualTo(PeekMenuDetent.Compact)
        assertThat(ConversationPeekSizing.initialDetent(screenReader = true, reduceMotion = false))
            .isEqualTo(PeekMenuDetent.Expanded)
        assertThat(ConversationPeekSizing.initialDetent(screenReader = false, reduceMotion = true))
            .isEqualTo(PeekMenuDetent.Expanded)
    }

    @Test
    fun `la carte mesuree une fois a sa taille de repos couvre toute hauteur atteinte`() {
        val g = geometry()

        assertThat(g.restingCard).isEqualTo(g.heightsAt(0f).card)
        listOf(0f, 0.3f, 0.7f, 1f).forEach { assertThat(g.heightsAt(it).card).isAtMost(g.restingCard) }
    }

    @Test
    fun `un ecran trop petit ne rend jamais de hauteur negative`() {
        val g = geometry(available = 150f, compactMenu = 100f, minCard = 120f, naturalMenu = 400f)

        val rest = g.heightsAt(0f)
        assertThat(rest.card).isAtLeast(0f)
        assertThat(rest.menu).isAtLeast(0f)
        assertThat(g.heightsAt(1f).card).isAtLeast(0f)
    }
}
