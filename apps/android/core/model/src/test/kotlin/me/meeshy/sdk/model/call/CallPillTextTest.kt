package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #17343 — the captions and the journal live INSIDE the pill, above its base row, in the same glass, on a duo as on a
 * group. (…) stows them, closing the actions gives them back, and a stowed pill leaves the captions in a glass without
 * its base row (law 11 of `docs/product/appels-vue-finale.md`). Mirrors iOS `CallPillText`.
 */
class CallPillTextTest {
    private fun text(
        captions: Boolean = true,
        layer: CallScreenLayer = CallScreenLayer.Idle,
        revealed: Boolean = true,
    ): CallPillText = CallPillText.resolve(isCaptionsEnabled = captions, layer = layer, isChromeRevealed = revealed)

    private val journal = CallScreenLayer.Panel(CallScreenPanel.Journal)

    @Test
    fun `captions on at rest live in the pill`() {
        assertThat(text()).isEqualTo(CallPillText.Captions)
    }

    @Test
    fun `captions off at rest the pill carries no text`() {
        assertThat(text(captions = false)).isEqualTo(CallPillText.None)
    }

    @Test
    fun `the open menu stows the captions and closing it gives them back`() {
        assertThat(text(layer = CallScreenLayer.Menu)).isEqualTo(CallPillText.None)
        assertThat(text(layer = CallScreenLayer.MenuOverJournal)).isEqualTo(CallPillText.None)
        assertThat(text(layer = CallScreenLayer.Menu.togglingMenu())).isEqualTo(CallPillText.Captions)
    }

    @Test
    fun `an option open in the pill replaces the captions`() {
        assertThat(text(layer = CallScreenLayer.Panel(CallScreenPanel.React))).isEqualTo(CallPillText.None)
        assertThat(text(layer = CallScreenLayer.Panel(CallScreenPanel.Record))).isEqualTo(CallPillText.None)
    }

    @Test
    fun `the open journal takes the place of the captions`() {
        assertThat(text(layer = journal)).isEqualTo(CallPillText.Journal)
    }

    @Test
    fun `the journal is there with my captions off too (#17342)`() {
        assertThat(text(captions = false, layer = journal)).isEqualTo(CallPillText.Journal)
    }

    @Test
    fun `a stowed journal comes back when the menu closes`() {
        val stowed = journal.togglingMenu()
        assertThat(text(layer = stowed)).isEqualTo(CallPillText.None)
        assertThat(text(layer = stowed.togglingMenu())).isEqualTo(CallPillText.Journal)
    }

    @Test
    fun `a stowed pill keeps the captions in a glass without its base row`() {
        assertThat(text(revealed = false)).isEqualTo(CallPillText.CaptionsAlone)
    }

    @Test
    fun `a stowed pill with the menu or the journal open still leaves the captions`() {
        assertThat(text(layer = CallScreenLayer.Menu, revealed = false)).isEqualTo(CallPillText.CaptionsAlone)
        assertThat(text(layer = journal, revealed = false)).isEqualTo(CallPillText.CaptionsAlone)
    }

    @Test
    fun `a stowed pill with my captions off has nothing to leave`() {
        assertThat(text(captions = false, revealed = false)).isEqualTo(CallPillText.None)
        assertThat(text(captions = false, layer = journal, revealed = false)).isEqualTo(CallPillText.None)
    }

    @Test
    fun `a mode has its own band so the pill carries no text`() {
        assertThat(text(layer = CallScreenLayer.Mode(CallScreenMode.Effects))).isEqualTo(CallPillText.None)
        assertThat(text(layer = CallScreenLayer.Mode(CallScreenMode.Montage), revealed = false)).isEqualTo(CallPillText.None)
    }

    @Test
    fun `only the captions alone leave the base row out`() {
        assertThat(CallPillText.CaptionsAlone.hasBaseRow).isFalse()
        assertThat(listOf(CallPillText.None, CallPillText.Captions, CallPillText.Journal).all { it.hasBaseRow }).isTrue()
    }

    @Test
    fun `a pill that carries text and the stowed glass share one cap, the resting pill keeps its own`() {
        assertThat(CallPillWidth.maxWidthDp(CallPillText.Captions)).isEqualTo(560f)
        assertThat(CallPillWidth.maxWidthDp(CallPillText.Journal)).isEqualTo(560f)
        assertThat(CallPillWidth.maxWidthDp(CallPillText.CaptionsAlone)).isEqualTo(560f)
        assertThat(CallPillWidth.maxWidthDp(CallPillText.None)).isEqualTo(440f)
        assertThat(CallRailsLayout.PILL_MAX_WIDTH_DP).isEqualTo(CallPillWidth.RESTING_DP)
    }

    @Test
    fun `the journal height is a share of the window, never below a readable minimum`() {
        assertThat(CallJournalSizing.heightDp(windowHeightDp = 844f)).isWithin(0.001f).of(844f * 0.45f)
        assertThat(CallJournalSizing.heightDp(windowHeightDp = 320f)).isEqualTo(CallJournalSizing.MINIMUM_DP)
        assertThat(CallJournalSizing.heightDp(windowHeightDp = 0f)).isEqualTo(CallJournalSizing.MINIMUM_DP)
    }

    @Test
    fun `the journal height never exceeds the maximum on a tall screen`() {
        assertThat(CallJournalSizing.heightDp(windowHeightDp = 1366f)).isEqualTo(CallJournalSizing.MAXIMUM_DP)
    }
}

class CallCaptionsFooterTest {
    private fun line(
        origin: String? = null,
        served: String? = null,
        awaitingUntilMs: Long? = null,
        isLocal: Boolean = false,
    ) = CallLiveCaptionLine(
        key = "k", speakerId = "u", speakerName = "Awa", isLocal = isLocal, text = "Salut",
        languageTag = if (origin != null && served != null) "$origin → $served" else origin,
        isFinal = true, capturedAtMs = 0, isShowingOriginal = served == null, canRevealOriginal = served != null,
        awaitingUntilMs = awaitingUntilMs, originLanguage = origin, servedLanguage = served,
    )

    @Test
    fun `a translated line tells how to see the original`() {
        assertThat(CallCaptionsFooter.resolve(listOf(line("EN", "FR")))).isEqualTo(CallCaptionsFooter.TouchForOriginal("EN → FR"))
    }

    @Test
    fun `the newest translated line decides the pair`() {
        val lines = listOf(line("ES", "FR"), line("EN", "FR"), line())
        assertThat(CallCaptionsFooter.resolve(lines)).isEqualTo(CallCaptionsFooter.TouchForOriginal("EN → FR"))
    }

    @Test
    fun `a translation awaited speaks before any pair`() {
        val lines = listOf(line("ES", "FR"), line("EN", awaitingUntilMs = 9_000))
        assertThat(CallCaptionsFooter.resolve(lines)).isEqualTo(CallCaptionsFooter.Translating("EN"))
    }

    @Test
    fun `several pairs of languages are counted once, not named`() {
        val lines = listOf(line("ES", "FR"), line("EN", "FR"), line("EN", "FR"))
        assertThat(CallCaptionsFooter.resolve(lines)).isEqualTo(CallCaptionsFooter.TranslatedLanguages(count = 3))
    }

    @Test
    fun `an origin label alone says nothing in the foot`() {
        assertThat(CallCaptionsFooter.resolve(listOf(line("EN"), line("EN")))).isEqualTo(CallCaptionsFooter.None)
    }

    @Test
    fun `no line says nothing`() {
        assertThat(CallCaptionsFooter.resolve(emptyList())).isEqualTo(CallCaptionsFooter.None)
    }
}
