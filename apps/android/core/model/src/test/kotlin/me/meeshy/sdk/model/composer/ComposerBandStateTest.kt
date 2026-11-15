package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerBandStateTest {
    private val hidden = ComposerBandState.Hidden
    private fun open(tool: StoryToolMode) = hidden.tapTool(tool)
    private val format = hidden.openFormatPanel(BandElementKind.TEXT, "t1")

    @Test
    fun `tapping a tool while hidden opens its panel`() {
        assertThat(open(StoryToolMode.TEXT).panel).isEqualTo(BandPanel.Tool(StoryToolMode.TEXT))
        assertThat(open(StoryToolMode.TEXT).activeTool).isEqualTo(StoryToolMode.TEXT)
    }

    @Test
    fun `tapping the open tool closes it and tapping another switches`() {
        assertThat(open(StoryToolMode.TEXT).tapTool(StoryToolMode.TEXT)).isEqualTo(hidden)
        assertThat(open(StoryToolMode.TEXT).tapTool(StoryToolMode.MEDIA).activeTool).isEqualTo(StoryToolMode.MEDIA)
    }

    @Test
    fun `the format panel takes precedence over tool taps and swipes`() {
        assertThat(format.tapTool(StoryToolMode.MEDIA)).isEqualTo(format)
        assertThat(format.swipeUpOnTool(StoryToolMode.MEDIA)).isEqualTo(format)
        assertThat(format.activeTool).isNull()
    }

    @Test
    fun `swipe up forces the tool open and is idempotent`() {
        val once = hidden.swipeUpOnTool(StoryToolMode.DRAWING)
        assertThat(once.activeTool).isEqualTo(StoryToolMode.DRAWING)
        assertThat(once.swipeUpOnTool(StoryToolMode.DRAWING)).isEqualTo(once)
    }

    @Test
    fun `hiding the chrome is allowed only with no panel open`() {
        assertThat(hidden.hideChrome().isChromeHidden).isTrue()
        assertThat(open(StoryToolMode.TEXT).hideChrome().isChromeHidden).isFalse()
        assertThat(format.hideChrome().isChromeHidden).isFalse()
    }

    @Test
    fun `any opening transition clears the voluntary hiding`() {
        val bare = hidden.hideChrome()
        assertThat(bare.tapTool(StoryToolMode.MEDIA).isChromeHidden).isFalse()
        assertThat(bare.swipeUpOnTool(StoryToolMode.MEDIA).isChromeHidden).isFalse()
        assertThat(bare.openFormatPanel(BandElementKind.MEDIA, "m").isChromeHidden).isFalse()
    }

    @Test
    fun `closing any panel gives the chrome back even from hidden`() {
        assertThat(hidden.hideChrome().closeAnyPanel()).isEqualTo(hidden)
        assertThat(open(StoryToolMode.TEXT).closeAnyPanel()).isEqualTo(hidden)
        assertThat(format.closeAnyPanel()).isEqualTo(hidden)
    }

    @Test
    fun `back and close format only act on their own panel`() {
        assertThat(format.backFromToolPanel()).isEqualTo(format)
        assertThat(open(StoryToolMode.TEXT).closeFormatPanel().activeTool).isEqualTo(StoryToolMode.TEXT)
        assertThat(format.closeFormatPanel()).isEqualTo(hidden)
        assertThat(open(StoryToolMode.TEXT).backFromToolPanel()).isEqualTo(hidden)
    }

    @Test
    fun `toggle chrome flips the voluntary hiding`() {
        assertThat(hidden.toggleChrome().isChromeHidden).isTrue()
        assertThat(hidden.toggleChrome().toggleChrome().isChromeHidden).isFalse()
    }

    @Test
    fun `only a tool panel allows the collapsible drawer`() {
        assertThat(open(StoryToolMode.TEXT).allowsCollapsibleDrawer).isTrue()
        assertThat(hidden.allowsCollapsibleDrawer).isFalse()
        assertThat(format.allowsCollapsibleDrawer).isFalse()
    }

    @Test
    fun `invariant - hidden chrome never coexists with a panel across every transition`() {
        val tools = StoryToolMode.entries
        var states = listOf(hidden, hidden.hideChrome(), format)
        repeat(3) {
            states = states.flatMap { s ->
                tools.flatMap { listOf(s.tapTool(it), s.swipeUpOnTool(it)) } +
                    listOf(s.hideChrome(), s.showChrome(), s.toggleChrome(), s.closeAnyPanel(),
                        s.openFormatPanel(BandElementKind.TEXT, "x"), s.backFromToolPanel(), s.closeFormatPanel())
            }.distinct()
            assertThat(states.filter { it.isChromeHidden && it.isPanelOpen }).isEmpty()
        }
    }
}
