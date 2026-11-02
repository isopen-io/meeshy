package me.meeshy.ui.component.chrome

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.click
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipe
import androidx.compose.ui.unit.DpRect
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.height
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.chrome.FloatingButtonGeometry
import me.meeshy.ui.component.CollapsibleSection
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #13671 — les deux disques flottent comme iOS (`FreeFloatingButtonsContainer`) : un calque PUR au-dessus du contenu.
 * Rien dessous ne s'écarte, et seule la surface des disques prend le doigt — un glisser ou un toucher posé à côté
 * d'un disque, même dans sa colonne, atteint la liste.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp-xxhdpi")
class MeeshyFloatingButtonsOverlayTest {

    @get:Rule
    val compose = createComposeRule()

    private class Taps {
        var left = 0
        var right = 0
        val rows = mutableListOf<Int>()
    }

    private fun render(row: @Composable (Int) -> Unit = {}): Pair<LazyListState, Taps> {
        val taps = Taps()
        lateinit var listState: LazyListState
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                listState = rememberLazyListState()
                Box(Modifier.fillMaxSize()) {
                    LazyColumn(state = listState, modifier = Modifier.fillMaxSize().testTag(LIST)) {
                        items(ROW_COUNT) { index ->
                            Box(
                                Modifier
                                    .fillMaxWidth()
                                    .height(ROW_HEIGHT.dp)
                                    .testTag("row-$index")
                                    .clickable { taps.rows += index },
                            ) { row(index) }
                        }
                    }
                    MeeshyFloatingButtons(
                        leftStorage = FloatingButtonGeometry.DEFAULT_FEED_STORAGE,
                        rightStorage = FloatingButtonGeometry.DEFAULT_MENU_STORAGE,
                        onLeftStorageChange = {},
                        onRightStorageChange = {},
                        onLeftTap = { taps.left++ },
                        onLeftLongPress = {},
                        onRightTap = { taps.right++ },
                        onRightLongPress = {},
                        leftSemantics = FloatingButtonSemantics(label = "Flux"),
                        rightSemantics = FloatingButtonSemantics(label = "Menu"),
                        leftContent = {},
                        rightContent = {},
                    )
                }
            }
        }
        compose.waitForIdle()
        return listState to taps
    }

    private fun disc(tag: String): DpRect = compose.onNodeWithTag(tag).getBoundsInRoot()

    private fun rowIndexAtHeightOf(disc: DpRect): Int {
        val centerY = (disc.top + disc.bottom).value / 2f
        return (0 until ROW_COUNT).first { i ->
            val row = compose.onNodeWithTag("row-$i").getBoundsInRoot()
            row.top.value <= centerY && row.bottom.value > centerY
        }
    }

    private fun rowAtHeightOf(disc: DpRect): DpRect = compose.onNodeWithTag("row-${rowIndexAtHeightOf(disc)}").getBoundsInRoot()

    private fun listPoint(xDp: Float, yDp: Float): Offset {
        val list = compose.onNodeWithTag(LIST).getBoundsInRoot()
        val density = compose.density.density
        return Offset((xDp - list.left.value) * density, (yDp - list.top.value) * density)
    }

    @Test
    fun `une rangee a la hauteur d un disque garde toute la largeur`() {
        render()
        val left = disc(FLOATING_BUTTON_LEFT_TAG)
        val right = disc(FLOATING_BUTTON_RIGHT_TAG)
        val list = compose.onNodeWithTag(LIST).getBoundsInRoot()

        listOf(left, right).forEach { disc ->
            val row = rowAtHeightOf(disc)
            assertThat(row.left.value).isEqualTo(list.left.value)
            assertThat(row.right.value).isEqualTo(list.right.value)
        }
    }

    @Test
    fun `l en-tete d une section a la hauteur d un disque garde la place de celui d une section loin des disques`() {
        render { index -> CollapsibleSection(title = "Section $index", count = index) {} }
        val left = disc(FLOATING_BUTTON_LEFT_TAG)
        val besideIndex = rowIndexAtHeightOf(left)
        val beside = compose.onNodeWithText("Section $besideIndex").getBoundsInRoot()
        val far = compose.onNodeWithText("Section 0").getBoundsInRoot()

        assertThat(besideIndex).isGreaterThan(0)
        assertThat(beside.left).isEqualTo(far.left)
        assertThat(beside.right).isEqualTo(far.right)
    }

    @Test
    fun `un glisser pose dans la colonne d un disque mais hors du disque fait defiler la liste, meme en passant dessus`() {
        val (listState, taps) = render()
        val left = disc(FLOATING_BUTTON_LEFT_TAG)
        val x = (left.left + left.right).value / 2f

        compose.onNodeWithTag(LIST).performTouchInput {
            swipe(
                start = listPoint(x, left.bottom.value + ROW_HEIGHT),
                end = listPoint(x, left.top.value - 2f * ROW_HEIGHT),
                durationMillis = 300,
            )
        }
        compose.waitForIdle()

        assertThat(listState.firstVisibleItemIndex).isGreaterThan(0)
        assertThat(taps.left).isEqualTo(0)
    }

    @Test
    fun `un toucher a cote d un disque atteint la rangee dessous, un toucher sur le disque reste au disque`() {
        val (_, taps) = render()
        val left = disc(FLOATING_BUTTON_LEFT_TAG)
        val centerY = (left.top + left.bottom).value / 2f
        val beside = left.right.value + 40f

        compose.onNodeWithTag(LIST).performTouchInput { click(listPoint(beside, centerY)) }
        compose.waitForIdle()
        assertThat(taps.rows).hasSize(1)
        assertThat(taps.left).isEqualTo(0)

        compose.onNodeWithTag(LIST).performTouchInput { click(listPoint((left.left + left.right).value / 2f, centerY)) }
        compose.waitForIdle()
        assertThat(taps.left).isEqualTo(1)
        assertThat(taps.rows).hasSize(1)
    }

    @Test
    fun `la surface tactile d un disque est le disque lui-meme`() {
        render()
        listOf(FLOATING_BUTTON_LEFT_TAG, FLOATING_BUTTON_RIGHT_TAG).forEach { tag ->
            val bounds = disc(tag)
            assertThat((bounds.right - bounds.left).value).isWithin(0.5f).of(FloatingButtonGeometry.BUTTON_SIZE)
            assertThat(bounds.height.value).isWithin(0.5f).of(FloatingButtonGeometry.BUTTON_SIZE)
        }
    }

    private companion object {
        const val LIST = "overlay-list"
        const val ROW_COUNT = 60
        const val ROW_HEIGHT = 64f
    }
}
