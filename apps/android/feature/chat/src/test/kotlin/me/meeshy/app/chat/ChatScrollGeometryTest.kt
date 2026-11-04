package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.ComposerKeyboardTransition
import org.junit.Test

class ChatScrollGeometryTest {

    // -- bottomIndex ---------------------------------------------------

    @Test
    fun `bottomIndex is the last row in TopDown`() {
        assertThat(ChatScrollGeometry.bottomIndex(4, ChatListOrientation.TopDown)).isEqualTo(4)
    }

    @Test
    fun `bottomIndex is row zero in BottomUp`() {
        assertThat(ChatScrollGeometry.bottomIndex(4, ChatListOrientation.BottomUp)).isEqualTo(0)
    }

    @Test
    fun `bottomIndex on a single-row list is row zero in both orientations`() {
        assertThat(ChatScrollGeometry.bottomIndex(0, ChatListOrientation.TopDown)).isEqualTo(0)
        assertThat(ChatScrollGeometry.bottomIndex(0, ChatListOrientation.BottomUp)).isEqualTo(0)
    }

    @Test
    fun `bottomIndex on an empty list stays -1 in both orientations`() {
        assertThat(ChatScrollGeometry.bottomIndex(-1, ChatListOrientation.TopDown)).isEqualTo(-1)
        assertThat(ChatScrollGeometry.bottomIndex(-1, ChatListOrientation.BottomUp)).isEqualTo(-1)
    }

    // -- isNearBottom ----------------------------------------------------

    @Test
    fun `TopDown -- the last visible row exactly at the end is near bottom`() {
        assertThat(ChatScrollGeometry.isNearBottom(9, 9, ChatListOrientation.TopDown)).isTrue()
    }

    @Test
    fun `TopDown -- within tolerance of the end is near bottom`() {
        // lastIndex=9, tolerance=2 -> row 7 still counts.
        assertThat(ChatScrollGeometry.isNearBottom(7, 9, ChatListOrientation.TopDown)).isTrue()
    }

    @Test
    fun `TopDown -- just past tolerance is not near bottom`() {
        assertThat(ChatScrollGeometry.isNearBottom(6, 9, ChatListOrientation.TopDown)).isFalse()
    }

    @Test
    fun `TopDown -- a reader scrolled into history is not near bottom`() {
        assertThat(ChatScrollGeometry.isNearBottom(0, 9, ChatListOrientation.TopDown)).isFalse()
    }

    @Test
    fun `BottomUp -- the first visible row exactly at index 0 is near bottom`() {
        assertThat(ChatScrollGeometry.isNearBottom(0, 9, ChatListOrientation.BottomUp)).isTrue()
    }

    @Test
    fun `BottomUp -- within tolerance of index 0 is near bottom`() {
        assertThat(ChatScrollGeometry.isNearBottom(2, 9, ChatListOrientation.BottomUp)).isTrue()
    }

    @Test
    fun `BottomUp -- just past tolerance is not near bottom`() {
        assertThat(ChatScrollGeometry.isNearBottom(3, 9, ChatListOrientation.BottomUp)).isFalse()
    }

    @Test
    fun `an empty or single-row list is always near bottom in both orientations`() {
        assertThat(ChatScrollGeometry.isNearBottom(0, -1, ChatListOrientation.TopDown)).isTrue()
        assertThat(ChatScrollGeometry.isNearBottom(0, 0, ChatListOrientation.TopDown)).isTrue()
        assertThat(ChatScrollGeometry.isNearBottom(0, -1, ChatListOrientation.BottomUp)).isTrue()
        assertThat(ChatScrollGeometry.isNearBottom(0, 0, ChatListOrientation.BottomUp)).isTrue()
    }

    // -- isNearOldEnd ------------------------------------------------------

    @Test
    fun `TopDown -- index zero is near the old end`() {
        assertThat(ChatScrollGeometry.isNearOldEnd(0, 20, ChatListOrientation.TopDown)).isTrue()
    }

    @Test
    fun `TopDown -- within threshold of index zero is near the old end`() {
        assertThat(ChatScrollGeometry.isNearOldEnd(2, 20, ChatListOrientation.TopDown)).isTrue()
    }

    @Test
    fun `TopDown -- just past the threshold is not near the old end`() {
        assertThat(ChatScrollGeometry.isNearOldEnd(3, 20, ChatListOrientation.TopDown)).isFalse()
    }

    @Test
    fun `BottomUp -- the last row is near the old end`() {
        assertThat(ChatScrollGeometry.isNearOldEnd(20, 20, ChatListOrientation.BottomUp)).isTrue()
    }

    @Test
    fun `BottomUp -- within threshold of the last row is near the old end`() {
        assertThat(ChatScrollGeometry.isNearOldEnd(18, 20, ChatListOrientation.BottomUp)).isTrue()
    }

    @Test
    fun `BottomUp -- just past the threshold is not near the old end`() {
        assertThat(ChatScrollGeometry.isNearOldEnd(17, 20, ChatListOrientation.BottomUp)).isFalse()
    }

    // -- bottomEdgeIndex / topEdgeIndex -----------------------------------
    //
    // A real `LazyListState` exposes two Compose-native readings —
    // `firstVisibleItemIndex` (lowest visible index) and the derived
    // `lastVisibleItemIndex` (highest visible index) — that never change
    // meaning themselves, but which one answers "the bottom edge" / "the old
    // (top) edge" flips with `reverseLayout`. These two functions are the
    // single place that translates Compose's own first/last into the chat's
    // semantic bottom/old-end edges, so [ChatScreen] never repeats the branch.

    @Test
    fun `TopDown -- the bottom edge is the highest visible index`() {
        assertThat(ChatScrollGeometry.bottomEdgeIndex(2, 9, ChatListOrientation.TopDown)).isEqualTo(9)
    }

    @Test
    fun `BottomUp -- the bottom edge is the lowest visible index`() {
        assertThat(ChatScrollGeometry.bottomEdgeIndex(2, 9, ChatListOrientation.BottomUp)).isEqualTo(2)
    }

    @Test
    fun `TopDown -- the old (top) edge is the lowest visible index`() {
        assertThat(ChatScrollGeometry.topEdgeIndex(2, 9, ChatListOrientation.TopDown)).isEqualTo(2)
    }

    @Test
    fun `BottomUp -- the old (top) edge is the highest visible index`() {
        assertThat(ChatScrollGeometry.topEdgeIndex(2, 9, ChatListOrientation.BottomUp)).isEqualTo(9)
    }
}

class ChatScrollGeometryBottomMarginTest {
    private fun transition(perFrame: Boolean, at: Long = 0L) =
        ComposerKeyboardTransition.announce(280f, 300L, at, perFrame)

    @org.junit.Test fun `sans mouvement la marge basse ne s'anime pas`() {
        org.junit.Assert.assertEquals(0, ChatScrollGeometry.bottomMarginAnimationMs(null, 0L))
    }

    @org.junit.Test fun `les insets image par image sont suivis sans animation doublee`() {
        org.junit.Assert.assertEquals(0, ChatScrollGeometry.bottomMarginAnimationMs(transition(perFrame = true), 100L))
    }

    @org.junit.Test fun `sans insets image par image la marge rejoint la duree annoncee pendant le mouvement`() {
        org.junit.Assert.assertEquals(300, ChatScrollGeometry.bottomMarginAnimationMs(transition(perFrame = false), 100L))
    }

    @org.junit.Test fun `apres la fin du mouvement aucune animation n'est rejouee`() {
        org.junit.Assert.assertEquals(0, ChatScrollGeometry.bottomMarginAnimationMs(transition(perFrame = false), 10_000L))
    }

    // -- anchoredScrollDelta (dépliage d'un long message) ----------------

    @org.junit.Test fun `un bord ancre qui n'a pas bouge ne demande aucun defilement`() {
        org.junit.Assert.assertEquals(
            0f,
            ChatScrollGeometry.anchoredScrollDelta(100f, 100f, ChatListOrientation.TopDown, 500f),
            0f,
        )
    }

    @org.junit.Test fun `liste classique un bord descendu se compense par un defilement positif`() {
        org.junit.Assert.assertEquals(
            40f,
            ChatScrollGeometry.anchoredScrollDelta(100f, 140f, ChatListOrientation.TopDown, 500f),
            0f,
        )
    }

    @org.junit.Test fun `liste inversee le meme decalage se compense par un defilement negatif`() {
        org.junit.Assert.assertEquals(
            -40f,
            ChatScrollGeometry.anchoredScrollDelta(100f, 140f, ChatListOrientation.BottomUp, 500f),
            0f,
        )
        org.junit.Assert.assertEquals(
            25f,
            ChatScrollGeometry.anchoredScrollDelta(100f, 75f, ChatListOrientation.BottomUp, 500f),
            0f,
        )
    }

    @org.junit.Test fun `la compensation est bornee a la hauteur du viewport`() {
        org.junit.Assert.assertEquals(
            500f,
            ChatScrollGeometry.anchoredScrollDelta(0f, 9_000f, ChatListOrientation.TopDown, 500f),
            0f,
        )
        org.junit.Assert.assertEquals(
            500f,
            ChatScrollGeometry.anchoredScrollDelta(9_000f, 0f, ChatListOrientation.BottomUp, 500f),
            0f,
        )
    }

    @org.junit.Test fun `un decalage sous le demi pixel est ignore`() {
        org.junit.Assert.assertEquals(
            0f,
            ChatScrollGeometry.anchoredScrollDelta(100f, 100.4f, ChatListOrientation.TopDown, 500f),
            0f,
        )
    }

    // -- rouleau : précharger à 4 hauteurs d'écran ------------------------

    @org.junit.Test fun `l'ancien est demande a moins de 4 hauteurs d'ecran du bord charge`() {
        org.junit.Assert.assertTrue(ChatScrollGeometry.shouldLoadOlder(distanceToOldEdgePx = 3_999f, viewportPx = 1_000f))
    }

    @org.junit.Test fun `a 4 hauteurs d'ecran exactement ou plus rien n'est demande`() {
        org.junit.Assert.assertFalse(ChatScrollGeometry.shouldLoadOlder(distanceToOldEdgePx = 4_000f, viewportPx = 1_000f))
        org.junit.Assert.assertFalse(ChatScrollGeometry.shouldLoadOlder(distanceToOldEdgePx = 9_000f, viewportPx = 1_000f))
    }

    @org.junit.Test fun `un viewport non mesure ne declenche aucun chargement`() {
        org.junit.Assert.assertFalse(ChatScrollGeometry.shouldLoadOlder(distanceToOldEdgePx = 0f, viewportPx = 0f))
    }

    @org.junit.Test fun `BottomUp -- la distance au bord ancien compte les rangees au dela de la derniere visible`() {
        val distance = ChatScrollGeometry.distanceToOldEdgePx(
            edgeIndex = 10, lastIndex = 40, edgeOvershootPx = 50f, averageRowPx = 100f,
            orientation = ChatListOrientation.BottomUp,
        )
        org.junit.Assert.assertEquals(3_050f, distance, 0.001f)
    }

    @org.junit.Test fun `TopDown -- la distance au bord ancien compte les rangees avant la premiere visible`() {
        val distance = ChatScrollGeometry.distanceToOldEdgePx(
            edgeIndex = 10, lastIndex = 40, edgeOvershootPx = 0f, averageRowPx = 100f,
            orientation = ChatListOrientation.TopDown,
        )
        org.junit.Assert.assertEquals(1_000f, distance, 0.001f)
    }

    @org.junit.Test fun `le bord atteint ne donne jamais une distance negative`() {
        val distance = ChatScrollGeometry.distanceToOldEdgePx(
            edgeIndex = 40, lastIndex = 40, edgeOvershootPx = -120f, averageRowPx = 100f,
            orientation = ChatListOrientation.BottomUp,
        )
        org.junit.Assert.assertEquals(0f, distance, 0.001f)
    }

    @org.junit.Test fun `un fil de 20 ecrans charge encore quand le lecteur est a 3 ecrans du bord et se tait a 5`() {
        val viewport = 2_000f
        val near = ChatScrollGeometry.distanceToOldEdgePx(17, 20, 0f, 2_000f, ChatListOrientation.BottomUp)
        val far = ChatScrollGeometry.distanceToOldEdgePx(15, 20, 0f, 2_000f, ChatListOrientation.BottomUp)
        org.junit.Assert.assertTrue(ChatScrollGeometry.shouldLoadOlder(near, viewport))
        org.junit.Assert.assertFalse(ChatScrollGeometry.shouldLoadOlder(far, viewport))
    }

    // -- encarts animes ----------------------------------------------------

    @org.junit.Test fun `le composeur qui grandit anime la reserve sur sa courte courbe`() {
        org.junit.Assert.assertEquals(ChatScrollGeometry.COMPOSER_INSET_MS, ChatScrollGeometry.bottomInsetAnimationMs(null, 0L))
        org.junit.Assert.assertEquals(
            ChatScrollGeometry.COMPOSER_INSET_MS,
            ChatScrollGeometry.bottomInsetAnimationMs(transition(perFrame = false), 10_000L),
        )
    }

    @org.junit.Test fun `pendant le clavier la reserve garde la courbe de l'appelant`() {
        org.junit.Assert.assertEquals(0, ChatScrollGeometry.bottomInsetAnimationMs(transition(perFrame = true), 100L))
        org.junit.Assert.assertEquals(300, ChatScrollGeometry.bottomInsetAnimationMs(transition(perFrame = false), 100L))
    }

    @org.junit.Test fun `la marge de section est de 12 dp`() {
        org.junit.Assert.assertEquals(12, ChatScrollGeometry.SECTION_HORIZONTAL_INSET_DP)
    }

    // -- seuil près du bas --------------------------------------------------

    @org.junit.Test fun `le seuil pres du bas est strict comme sur iOS`() {
        org.junit.Assert.assertTrue(ChatScrollGeometry.isNearBottomPx(199.9f, 200f))
        org.junit.Assert.assertFalse(ChatScrollGeometry.isNearBottomPx(200f, 200f))
    }

    @org.junit.Test fun `la distance au bas cumule le defilement de la premiere rangee et les rangees passees`() {
        org.junit.Assert.assertEquals(0f, ChatScrollGeometry.distanceFromBottomPx(0, 0, 120f), 0.001f)
        org.junit.Assert.assertEquals(60f, ChatScrollGeometry.distanceFromBottomPx(0, 60, 120f), 0.001f)
        org.junit.Assert.assertEquals(300f, ChatScrollGeometry.distanceFromBottomPx(2, 60, 120f), 0.001f)
    }
}
