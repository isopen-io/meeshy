package me.meeshy.sdk.model.navigation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.navigation.PresentedSurfaceKind.COMPOSER
import me.meeshy.sdk.model.navigation.PresentedSurfaceKind.GAME
import me.meeshy.sdk.model.navigation.PresentedSurfaceKind.REELS
import me.meeshy.sdk.model.navigation.PresentedSurfaceKind.SHEET
import me.meeshy.sdk.model.navigation.PresentedSurfaceKind.STORY_VIEWER
import me.meeshy.sdk.model.navigation.PresentedSurfaceYield.CLOSES
import me.meeshy.sdk.model.navigation.PresentedSurfaceYield.RETAINS
import org.junit.Test

class PresentedSurfaceTest {
    private class Clock(var now: Long = 0L)

    private class Harness(val clock: Clock = Clock()) {
        val ledger = PresentedSurfaceLedger(nowMillis = { clock.now })
        val closed = mutableListOf<PresentedSurfaceKind>()
        val opened = mutableListOf<Boolean>()
        var composerYield = RETAINS

        fun declare(kind: PresentedSurfaceKind, scope: PresentedSurfaceScope? = null, yields: () -> PresentedSurfaceYield = { CLOSES }) =
            ledger.declare(kind, scope, answer = yields, close = { closed += kind })

        fun open(scope: PresentedSurfaceScope? = null) = ledger.clearForConversation(scope) { opened += it }
    }

    @Test
    fun `sans surface l'ouverture est immediate et rien ne s'est ferme`() {
        val h = Harness()
        h.open()
        assertThat(h.opened).containsExactly(false)
    }

    @Test
    fun `les surfaces qui ferment se referment puis l'ouverture le dit`() {
        val h = Harness()
        h.declare(STORY_VIEWER)
        h.declare(SHEET)
        h.open()
        assertThat(h.closed).containsExactly(STORY_VIEWER, SHEET)
        assertThat(h.opened).containsExactly(true)
        assertThat(h.ledger.declaredKinds).isEmpty()
    }

    @Test
    fun `une surface qui retient reste et l'ouverture attend son depart`() {
        val h = Harness()
        val composer = h.declare(COMPOSER) { RETAINS }
        h.declare(SHEET)
        h.open()
        assertThat(h.closed).containsExactly(SHEET)
        assertThat(h.opened).isEmpty()
        assertThat(h.ledger.declaredKinds).containsExactly(COMPOSER)
        h.ledger.retire(composer)
        assertThat(h.opened).containsExactly(false)
    }

    @Test
    fun `ce qui est sous une surface qui retient reste aussi`() {
        val h = Harness()
        h.declare(REELS)
        h.declare(GAME) { RETAINS }
        h.open()
        assertThat(h.closed).isEmpty()
        assertThat(h.ledger.declaredKinds).containsExactly(REELS, GAME).inOrder()
    }

    @Test
    fun `la reponse d'un composeur est relue a chaque demande`() {
        val h = Harness()
        h.declare(COMPOSER) { h.composerYield }
        h.open()
        assertThat(h.opened).isEmpty()
        h.composerYield = CLOSES
        h.open()
        assertThat(h.opened).containsExactly(true)
        assertThat(h.closed).containsExactly(COMPOSER)
    }

    @Test
    fun `une ouverture ne ferme que les surfaces de sa fenetre`() {
        val h = Harness()
        val mine = PresentedSurfaceScope("a")
        val other = PresentedSurfaceScope("b")
        h.declare(STORY_VIEWER, mine)
        h.declare(REELS, other)
        h.open(mine)
        assertThat(h.closed).containsExactly(STORY_VIEWER)
        assertThat(h.ledger.declaredKinds).containsExactly(REELS)
    }

    @Test
    fun `une surface sans fenetre se referme pour toute fenetre`() {
        val h = Harness()
        h.declare(REELS, scope = null)
        h.open(PresentedSurfaceScope("a"))
        assertThat(h.closed).containsExactly(REELS)
    }

    @Test
    fun `une ouverture retenue trop longtemps est oubliee`() {
        val h = Harness()
        val composer = h.declare(COMPOSER) { RETAINS }
        h.open()
        h.clock.now = 120_001L
        h.ledger.retire(composer)
        assertThat(h.opened).isEmpty()
    }

    @Test
    fun `la derniere ouverture demandee remplace la precedente de sa fenetre`() {
        val h = Harness()
        val composer = h.declare(COMPOSER) { RETAINS }
        h.open()
        h.open()
        h.ledger.retire(composer)
        assertThat(h.opened).hasSize(1)
    }

    @Test
    fun `une fermeture qui se retire elle-meme ne relance rien`() {
        val h = Harness()
        lateinit var token: PresentedSurfaceToken
        token = h.ledger.declare(SHEET, answer = { CLOSES }, close = { h.ledger.retire(token) })
        h.open()
        assertThat(h.opened).containsExactly(true)
    }
}
