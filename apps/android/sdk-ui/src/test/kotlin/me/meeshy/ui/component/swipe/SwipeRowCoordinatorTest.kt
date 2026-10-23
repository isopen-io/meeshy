package me.meeshy.ui.component.swipe

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.chrome.SwipeRowFrame
import org.junit.Test

class SwipeRowCoordinatorTest {
    private val frame = SwipeRowFrame(0f, 0f, 100f, 50f)

    @Test
    fun `ouvrir une seconde ligne referme la premiere`() {
        val coordinator = SwipeRowCoordinator()
        var closedA = 0
        coordinator.rowDidOpen("a") { closedA++ }
        coordinator.rowDidOpen("b") { }
        assertThat(closedA).isEqualTo(1)
        assertThat(coordinator.hasOpenRow).isTrue()
    }

    @Test
    fun `une ligne qui se ferme elle-meme libere le coordinateur sans rappel`() {
        val coordinator = SwipeRowCoordinator()
        var closed = 0
        coordinator.rowDidOpen("a") { closed++ }
        coordinator.rowDidClose("a")
        assertThat(coordinator.hasOpenRow).isFalse()
        assertThat(closed).isEqualTo(0)
    }

    @Test
    fun `une ligne autre que l'ouverte ne peut pas liberer le coordinateur`() {
        val coordinator = SwipeRowCoordinator()
        coordinator.rowDidOpen("a") { }
        coordinator.rowDidClose("b")
        assertThat(coordinator.hasOpenRow).isTrue()
    }

    @Test
    fun `un toucher hors du cadre ferme la ligne ouverte`() {
        val coordinator = SwipeRowCoordinator()
        var closed = 0
        coordinator.rowDidOpen("a") { closed++ }
        coordinator.rowFrameDidChange("a", frame)
        coordinator.touchBegan(50f, 25f)
        assertThat(closed).isEqualTo(0)
        coordinator.touchBegan(50f, 200f)
        assertThat(closed).isEqualTo(1)
        assertThat(coordinator.hasOpenRow).isFalse()
    }

    @Test
    fun `un cadre non mesure referme au premier toucher`() {
        val coordinator = SwipeRowCoordinator()
        var closed = 0
        coordinator.rowDidOpen("a") { closed++ }
        coordinator.touchBegan(5f, 5f)
        assertThat(closed).isEqualTo(1)
    }

    @Test
    fun `sans ligne ouverte un toucher ne fait rien`() {
        val coordinator = SwipeRowCoordinator()
        coordinator.touchBegan(1f, 1f)
        assertThat(coordinator.hasOpenRow).isFalse()
    }

    @Test
    fun `le cadre d'une ligne non ouverte est ignore`() {
        val coordinator = SwipeRowCoordinator()
        var closed = 0
        coordinator.rowDidOpen("a") { closed++ }
        coordinator.rowFrameDidChange("b", frame)
        coordinator.touchBegan(50f, 25f)
        assertThat(closed).isEqualTo(1)
    }
}
