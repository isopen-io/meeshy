package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallScreenLayerTest {
    private val all = CallActionSet(
        myImage = listOf(CallAction.Camera, CallAction.Effects),
        theCall = listOf(CallAction.Journal, CallAction.React, CallAction.Recording, CallAction.AddPeople, CallAction.Capture),
    )

    @Test
    fun `toggling the menu opens, closes and leaves a mode alone`() {
        assertThat(CallScreenLayer.Idle.togglingMenu()).isEqualTo(CallScreenLayer.Menu)
        assertThat(CallScreenLayer.Menu.togglingMenu()).isEqualTo(CallScreenLayer.Idle)
        assertThat(CallScreenLayer.Panel(CallScreenPanel.React).togglingMenu()).isEqualTo(CallScreenLayer.Idle)
        assertThat(CallScreenLayer.Panel(CallScreenPanel.Record).togglingMenu()).isEqualTo(CallScreenLayer.Idle)
        val mode = CallScreenLayer.Mode(CallScreenMode.Effects)
        assertThat(mode.togglingMenu()).isEqualTo(mode)
    }

    @Test
    fun `the menu over an open journal stows it instead of closing it`() {
        assertThat(CallScreenLayer.Panel(CallScreenPanel.Journal).togglingMenu()).isEqualTo(CallScreenLayer.MenuOverJournal)
    }

    @Test
    fun `closing the menu gives the stowed journal back`() {
        assertThat(CallScreenLayer.MenuOverJournal.togglingMenu()).isEqualTo(CallScreenLayer.Panel(CallScreenPanel.Journal))
    }

    @Test
    fun `the menu over a journal is a menu - the rails and rows come out, nothing is open yet`() {
        val layer = CallScreenLayer.MenuOverJournal
        assertThat(layer.isExpanded).isTrue()
        assertThat(layer.showsFamilyRows).isTrue()
        assertThat(layer.openPanel).isNull()
        assertThat(layer.pillPanel).isNull()
        assertThat(layer.mayAutoHide).isTrue()
        assertThat(layer.freesTheScreen).isFalse()
    }

    @Test
    fun `from the menu over a journal an option opens the panel asked`() {
        assertThat(CallScreenLayer.MenuOverJournal.opening(CallScreenPanel.Journal)).isEqualTo(CallScreenLayer.Panel(CallScreenPanel.Journal))
        assertThat(CallScreenLayer.MenuOverJournal.opening(CallScreenPanel.React)).isEqualTo(CallScreenLayer.Panel(CallScreenPanel.React))
    }

    @Test
    fun `back to menu leaves the menu over a journal as it is, and closed goes idle`() {
        assertThat(CallScreenLayer.MenuOverJournal.backToMenu()).isEqualTo(CallScreenLayer.MenuOverJournal)
        assertThat(CallScreenLayer.MenuOverJournal.closed()).isEqualTo(CallScreenLayer.Idle)
    }

    @Test
    fun `an open journal does not free the screen - my tile stays`() {
        val journal = CallScreenLayer.Panel(CallScreenPanel.Journal)
        assertThat(journal.freesTheScreen).isFalse()
        assertThat(CallChromeVisibility(isModeActive = journal.freesTheScreen).isVisible(CallChromeElement.SelfView)).isTrue()
    }

    @Test
    fun `opening a panel closes the menu and opening it again returns to the menu`() {
        val open = CallScreenLayer.Menu.opening(CallScreenPanel.React)
        assertThat(open).isEqualTo(CallScreenLayer.Panel(CallScreenPanel.React))
        assertThat(open.isExpanded).isTrue()
        assertThat(open.opening(CallScreenPanel.React)).isEqualTo(CallScreenLayer.Menu)
        assertThat(open.opening(CallScreenPanel.Journal)).isEqualTo(CallScreenLayer.Panel(CallScreenPanel.Journal))
    }

    @Test
    fun `a mode refuses to open a panel`() {
        val mode = CallScreenLayer.Mode(CallScreenMode.Montage)
        assertThat(mode.opening(CallScreenPanel.People)).isEqualTo(mode)
    }

    @Test
    fun `back to menu only leaves a panel`() {
        assertThat(CallScreenLayer.Panel(CallScreenPanel.People).backToMenu()).isEqualTo(CallScreenLayer.Menu)
        assertThat(CallScreenLayer.Idle.backToMenu()).isEqualTo(CallScreenLayer.Idle)
        assertThat(CallScreenLayer.Menu.backToMenu()).isEqualTo(CallScreenLayer.Menu)
    }

    @Test
    fun `closed always goes idle and entering a mode frees the screen`() {
        assertThat(CallScreenLayer.Menu.closed()).isEqualTo(CallScreenLayer.Idle)
        val mode = CallScreenLayer.Menu.entering(CallScreenMode.Effects)
        assertThat(mode.freesTheScreen).isTrue()
        assertThat(mode.mayAutoHide).isFalse()
        assertThat(mode.exitingMode()).isEqualTo(CallScreenLayer.Idle)
        assertThat(CallScreenLayer.Menu.exitingMode()).isEqualTo(CallScreenLayer.Menu)
    }

    @Test
    fun `only idle and menu may auto hide`() {
        assertThat(CallScreenLayer.Idle.mayAutoHide).isTrue()
        assertThat(CallScreenLayer.Menu.mayAutoHide).isTrue()
        assertThat(CallScreenLayer.Panel(CallScreenPanel.React).mayAutoHide).isFalse()
    }

    @Test
    fun `react, record and the journal are drawn in the pill and hide the family rows`() {
        val react = CallScreenLayer.Panel(CallScreenPanel.React)
        assertThat(react.pillPanel).isEqualTo(CallScreenPanel.React)
        assertThat(react.showsFamilyRows).isFalse()
        val journal = CallScreenLayer.Panel(CallScreenPanel.Journal)
        assertThat(journal.pillPanel).isEqualTo(CallScreenPanel.Journal)
        assertThat(journal.showsFamilyRows).isFalse()
        assertThat(CallScreenLayer.Menu.showsFamilyRows).isTrue()
        assertThat(CallScreenLayer.Idle.showsFamilyRows).isFalse()
    }

    @Test
    fun `add people stays a sheet over the family rows`() {
        val people = CallScreenLayer.Panel(CallScreenPanel.People)
        assertThat(people.pillPanel).isNull()
        assertThat(people.showsFamilyRows).isTrue()
    }

    @Test
    fun `reconciliation drops a panel to the menu and a mode to idle when its action vanishes`() {
        val without = CallActionSet(myImage = emptyList(), theCall = emptyList())
        assertThat(CallScreenLayer.Panel(CallScreenPanel.Record).reconciled(without)).isEqualTo(CallScreenLayer.Menu)
        assertThat(CallScreenLayer.Mode(CallScreenMode.Montage).reconciled(without)).isEqualTo(CallScreenLayer.Idle)
        assertThat(CallScreenLayer.Idle.reconciled(without)).isEqualTo(CallScreenLayer.Idle)
        assertThat(CallScreenLayer.Menu.reconciled(without)).isEqualTo(CallScreenLayer.Menu)
    }

    @Test
    fun `reconciliation drops the menu over a journal to the menu when the journal vanishes`() {
        val without = CallActionSet(myImage = emptyList(), theCall = emptyList())
        assertThat(CallScreenLayer.MenuOverJournal.reconciled(without)).isEqualTo(CallScreenLayer.Menu)
        assertThat(CallScreenLayer.MenuOverJournal.reconciled(all)).isEqualTo(CallScreenLayer.MenuOverJournal)
    }

    @Test
    fun `reconciliation keeps a layer whose action is still offered`() {
        val panel = CallScreenLayer.Panel(CallScreenPanel.Record)
        assertThat(panel.reconciled(all)).isEqualTo(panel)
        val mode = CallScreenLayer.Mode(CallScreenMode.Effects)
        assertThat(mode.reconciled(all)).isEqualTo(mode)
    }
}
