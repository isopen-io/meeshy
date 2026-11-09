package me.meeshy.sdk.model.conversationlist

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationPeekSizingTest {

    private companion object {
        const val TOLERANCE = 0.01f
    }

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
        assertThat(heights.card).isWithin(TOLERANCE).of(553.6f)
        assertThat(heights.card).isGreaterThan(heights.menu)
    }

    @Test
    fun `au repos la carte ne fait que 80 pour cent de la place que le menu compact lui laisse`() {
        val g = geometry()

        assertThat(g.heightsAt(0f).card).isWithin(TOLERANCE).of((800f - 8f - 100f) * ConversationPeekSizing.CARD_SHARE)
    }

    @Test
    fun `un voile reste visible au-dessus de la carte a tous les crans et se touche pour fermer`() {
        val g = geometry()

        assertThat(g.veil).isWithin(TOLERANCE).of(138.4f)
        listOf(0f, 0.5f, 1f).forEach { p ->
            val h = g.heightsAt(p)
            assertThat(g.veil + h.card + 8f + h.menu).isWithin(TOLERANCE).of(800f)
        }
    }

    @Test
    fun `tire jusqu'au bout le menu montre tout et la carte se reduit d'autant`() {
        val g = geometry()
        val rest = g.heightsAt(progress = 0f)
        val heights = g.heightsAt(progress = 1f)

        assertThat(heights.menu).isEqualTo(500f)
        assertThat(rest.card - heights.card).isWithin(TOLERANCE).of(400f)
    }

    @Test
    fun `a mi-course les deux hauteurs suivent la progression et leur somme ne bouge pas`() {
        val g = geometry()
        val half = g.heightsAt(progress = 0.5f)
        val rest = g.heightsAt(progress = 0f)

        assertThat(half.menu).isEqualTo(300f)
        assertThat(half.card + half.menu).isWithin(TOLERANCE).of(rest.card + rest.menu)
    }

    @Test
    fun `un menu plus haut que l'ecran s'arrete la ou la carte garde son minimum`() {
        val g = geometry(naturalMenu = 2_000f)

        assertThat(g.expandedMenu).isWithin(TOLERANCE).of(800f - 8f - 138.4f - 120f)
        assertThat(g.heightsAt(1f).card).isWithin(TOLERANCE).of(120f)
        assertThat(g.menuCeiling).isEqualTo(g.expandedMenu)
    }

    @Test
    fun `le panneau fait 80 pour cent de la largeur entre les marges et reste centre`() {
        val width = ConversationPeekSizing.panelWidth(available = 400f, margin = 14f)

        assertThat(width).isWithin(TOLERANCE).of(297.6f)
        assertThat(ConversationPeekSizing.panelOffset(available = 400f, panelWidth = width)).isWithin(TOLERANCE).of(51.2f)
        assertThat(ConversationPeekSizing.panelWidth(available = 20f, margin = 14f)).isEqualTo(0f)
    }

    @Test
    fun `glisser la carte vers le bas la suit et ne remonte jamais au-dessus de sa place`() {
        assertThat(ConversationPeekPullDown.offsetAfterDrag(offset = 0f, downwardDelta = 60f)).isEqualTo(60f)
        assertThat(ConversationPeekPullDown.offsetAfterDrag(offset = 60f, downwardDelta = -100f)).isEqualTo(0f)
    }

    @Test
    fun `relachee au-dela de 79 pour cent de la course projetee l'apercu se ferme sinon il revient`() {
        val distance = 140f

        assertThat(ConversationPeekPullDown.release(offset = 112f, downwardVelocity = 0f, distance = distance))
            .isEqualTo(PeekPullDownRelease.Dismiss)
        assertThat(ConversationPeekPullDown.release(offset = 100f, downwardVelocity = 0f, distance = distance))
            .isEqualTo(PeekPullDownRelease.Restore)
        assertThat(ConversationPeekPullDown.release(offset = 40f, downwardVelocity = 2_000f, distance = distance))
            .isEqualTo(PeekPullDownRelease.Dismiss)
        assertThat(ConversationPeekPullDown.release(offset = 130f, downwardVelocity = -2_000f, distance = distance))
            .isEqualTo(PeekPullDownRelease.Restore)
    }

    @Test
    fun `la progression du glisse vers le bas reste entre 0 et 1`() {
        assertThat(ConversationPeekPullDown.progress(offset = 70f, distance = 140f)).isEqualTo(0.5f)
        assertThat(ConversationPeekPullDown.progress(offset = 500f, distance = 140f)).isEqualTo(1f)
        assertThat(ConversationPeekPullDown.progress(offset = 10f, distance = 0f)).isEqualTo(0f)
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
