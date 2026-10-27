package me.meeshy.sdk.model.reading.mode

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode.BUBBLES
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode.FOCAL
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode.RIVER
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode.SCRIPT
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode.SUMMARY
import me.meeshy.sdk.model.reading.mode.OrchestratorDecisionReason.CLAMPED_UNAVAILABLE
import me.meeshy.sdk.model.reading.mode.OrchestratorDecisionReason.DEFAULT
import me.meeshy.sdk.model.reading.mode.OrchestratorDecisionReason.FLAG_DISABLED
import me.meeshy.sdk.model.reading.mode.OrchestratorDecisionReason.STALE_ABSENCE
import me.meeshy.sdk.model.reading.mode.OrchestratorDecisionReason.STICKY
import me.meeshy.sdk.model.reading.mode.OrchestratorDecisionReason.UNREAD_OVER_CAP
import org.junit.Test

class ReadingModeLensTest {

    private val all = ConversationReadingMode.entries.toSet()
    private val bubblesOnly = setOf(BUBBLES)
    private val now = 1_000_000_000_000L

    private fun caps(
        isAnonymous: Boolean = false,
        type: ReadingModeConversationType = ReadingModeConversationType.GROUP,
        count: Int? = 3,
        flag: Boolean = true,
        river: Boolean = true,
    ) = ReadingModeOrchestrator.resolveCapabilities(isAnonymous, flag, river, type, count)

    // --- Rangée plate ---

    @Test
    fun `script and focal share the flat row, the other modes do not`() {
        assertThat(ConversationReadingMode.entries.filter { it.usesFlatRow }).containsExactly(FOCAL, SCRIPT)
    }

    @Test
    fun `with script delivered, auto opens in script as on iOS and summary falls back to script`() {
        val delivered = setOf(BUBBLES, SCRIPT)
        val auto = ReadingModeOpening.decide(
            stickyMode = null, unreadCount = 0, lastOpenedAtMs = now, nowMs = now,
            capabilities = caps(), isFlagEnabled = true, delivered = delivered,
        )
        assertThat(auto.mode).isEqualTo(SCRIPT)
        assertThat(auto.reason).isEqualTo(DEFAULT)
        val overCap = ReadingModeOpening.decide(
            stickyMode = null, unreadCount = 40, lastOpenedAtMs = now, nowMs = now,
            capabilities = caps(), isFlagEnabled = true, delivered = delivered,
        )
        assertThat(overCap.mode).isEqualTo(SCRIPT)
        val stickyBubbles = ReadingModeOpening.decide(
            stickyMode = BUBBLES, unreadCount = 0, lastOpenedAtMs = now, nowMs = now,
            capabilities = caps(), isFlagEnabled = true, delivered = delivered,
        )
        assertThat(stickyBubbles.mode).isEqualTo(BUBBLES)
        assertThat(stickyBubbles.reason).isEqualTo(STICKY)
    }

    // --- Cycle ---

    @Test
    fun `cycle advances, wraps, restarts and refuses a single entry`() {
        val order = listOf(FOCAL, SCRIPT, BUBBLES)
        assertThat(ReadingModeCycle.next(FOCAL, order)).isEqualTo(SCRIPT)
        assertThat(ReadingModeCycle.next(BUBBLES, order)).isEqualTo(FOCAL)
        assertThat(ReadingModeCycle.next(SUMMARY, order)).isEqualTo(FOCAL)
        assertThat(ReadingModeCycle.next(BUBBLES, listOf(BUBBLES))).isNull()
        assertThat(ReadingModeCycle.next(BUBBLES, emptyList())).isNull()
    }

    @Test
    fun `cycle keeps only what the law allows and the app renders`() {
        assertThat(ReadingModeLensCatalog.cycle(caps(), all)).containsExactly(FOCAL, SCRIPT, BUBBLES).inOrder()
        assertThat(ReadingModeLensCatalog.cycle(caps(), bubblesOnly)).containsExactly(BUBBLES)
        assertThat(ReadingModeLensCatalog.cycle(caps(), setOf(SCRIPT, BUBBLES))).containsExactly(SCRIPT, BUBBLES).inOrder()
    }

    // --- Catalogue ---

    @Test
    fun `rows list the five modes in display order with the current one checked`() {
        val rows = ReadingModeLensCatalog.rows(caps(), currentMode = SCRIPT, delivered = all)
        assertThat(rows.map { it.mode }).containsExactly(FOCAL, SCRIPT, BUBBLES, SUMMARY, RIVER).inOrder()
        assertThat(rows.single { it.isCurrent }.mode).isEqualTo(SCRIPT)
    }

    @Test
    fun `river reason trifurcates - direct, unknown count, below threshold`() {
        fun riverRow(c: ReadingModeCapabilities) =
            ReadingModeLensCatalog.rows(c, BUBBLES, all).single { it.mode == RIVER }
        assertThat(riverRow(caps(type = ReadingModeConversationType.DIRECT, count = 2)).unavailableReason)
            .isEqualTo(LensUnavailableReason.RiverNever)
        assertThat(riverRow(caps(count = null)).unavailableReason)
            .isEqualTo(LensUnavailableReason.RiverThresholdOnly(5))
        assertThat(riverRow(caps(count = 3)).unavailableReason)
            .isEqualTo(LensUnavailableReason.RiverBelowThreshold(5, 3))
        val open = riverRow(caps(count = 8))
        assertThat(open.isAvailable).isTrue()
        assertThat(open.unavailableReason).isNull()
    }

    @Test
    fun `summary is greyed for a guest, bubbles always available`() {
        val rows = ReadingModeLensCatalog.rows(caps(isAnonymous = true), BUBBLES, all)
        assertThat(rows.single { it.mode == SUMMARY }.unavailableReason).isEqualTo(LensUnavailableReason.Generic)
        assertThat(rows.single { it.mode == BUBBLES }.isAvailable).isTrue()
    }

    @Test
    fun `a law-allowed mode not yet rendered is greyed, never removed`() {
        val rows = ReadingModeLensCatalog.rows(caps(count = 8), BUBBLES, bubblesOnly)
        assertThat(rows).hasSize(5)
        listOf(FOCAL, SCRIPT, SUMMARY, RIVER).forEach { mode ->
            assertThat(rows.single { it.mode == mode }.unavailableReason).isEqualTo(LensUnavailableReason.NotYetRendered)
        }
        // La raison de la loi prime : en direct, la Rivière dit « jamais », pas « bientôt ».
        val direct = ReadingModeLensCatalog.rows(caps(type = ReadingModeConversationType.DIRECT), BUBBLES, bubblesOnly)
        assertThat(direct.single { it.mode == RIVER }.unavailableReason).isEqualTo(LensUnavailableReason.RiverNever)
    }

    @Test
    fun `the chip exists only with the flag on`() {
        assertThat(ReadingModeLensCatalog.showsChip(caps())).isTrue()
        assertThat(ReadingModeLensCatalog.showsChip(caps(flag = false))).isFalse()
    }

    // --- Ouverture ---

    private fun open(
        sticky: ConversationReadingMode? = null,
        unread: Int = 0,
        lastOpened: Long? = now - 1_000,
        capabilities: ReadingModeCapabilities = caps(),
        flag: Boolean = true,
        delivered: Set<ConversationReadingMode> = all,
        lands: Boolean = false,
    ) = ReadingModeOpening.decide(sticky, unread, lastOpened, now, capabilities, flag, delivered, lands)

    @Test
    fun `auto opens in Script like iOS when every view is rendered`() {
        assertThat(open()).isEqualTo(OrchestratorDecision(SCRIPT, DEFAULT))
        assertThat(open(unread = 26)).isEqualTo(OrchestratorDecision(SUMMARY, UNREAD_OVER_CAP))
        assertThat(open(unread = 10, lastOpened = null)).isEqualTo(OrchestratorDecision(SUMMARY, STALE_ABSENCE))
    }

    @Test
    fun `a sticky Bubbles choice renders Bubbles, where the law alone clamps it`() {
        assertThat(open(sticky = BUBBLES)).isEqualTo(OrchestratorDecision(BUBBLES, STICKY))
        assertThat(open(sticky = BUBBLES, unread = 40)).isEqualTo(OrchestratorDecision(BUBBLES, STICKY))
    }

    @Test
    fun `flag off renders Script with the law reason`() {
        assertThat(open(flag = false, capabilities = caps(flag = false))).isEqualTo(OrchestratorDecision(SCRIPT, FLAG_DISABLED))
    }

    @Test
    fun `landing on a message turns Summary and River into Script, reason kept`() {
        assertThat(open(unread = 30, lands = true)).isEqualTo(OrchestratorDecision(SCRIPT, UNREAD_OVER_CAP))
        assertThat(open(sticky = RIVER, capabilities = caps(count = 9), lands = true)).isEqualTo(OrchestratorDecision(SCRIPT, STICKY))
        assertThat(open(sticky = BUBBLES, lands = true)).isEqualTo(OrchestratorDecision(BUBBLES, STICKY))
    }

    @Test
    fun `with only Bubbles rendered, auto stays Bubbles and a stale sticky choice says clamped`() {
        assertThat(open(delivered = bubblesOnly)).isEqualTo(OrchestratorDecision(BUBBLES, DEFAULT))
        assertThat(open(unread = 30, delivered = bubblesOnly)).isEqualTo(OrchestratorDecision(BUBBLES, UNREAD_OVER_CAP))
        assertThat(open(sticky = FOCAL, delivered = bubblesOnly)).isEqualTo(OrchestratorDecision(BUBBLES, CLAMPED_UNAVAILABLE))
        assertThat(open(sticky = BUBBLES, delivered = bubblesOnly)).isEqualTo(OrchestratorDecision(BUBBLES, STICKY))
    }

    @Test
    fun `an unrendered mode falls back to Script once Script is rendered`() {
        assertThat(open(sticky = FOCAL, delivered = setOf(SCRIPT, BUBBLES))).isEqualTo(OrchestratorDecision(SCRIPT, CLAMPED_UNAVAILABLE))
        assertThat(open(unread = 30, delivered = setOf(SCRIPT, BUBBLES))).isEqualTo(OrchestratorDecision(SCRIPT, UNREAD_OVER_CAP))
    }

    @Test
    fun `the AUTO notch hides for a sticky choice and a disabled flag`() {
        assertThat(ReadingModeOpening.isAuto(OrchestratorDecision(BUBBLES, DEFAULT))).isTrue()
        assertThat(ReadingModeOpening.isAuto(OrchestratorDecision(BUBBLES, CLAMPED_UNAVAILABLE))).isTrue()
        assertThat(ReadingModeOpening.isAuto(OrchestratorDecision(BUBBLES, STICKY))).isFalse()
        assertThat(ReadingModeOpening.isAuto(OrchestratorDecision(SCRIPT, FLAG_DISABLED))).isFalse()
    }

    // --- Préférence ---

    @Test
    fun `preference mapping is total both ways`() {
        ConversationReadingMode.entries.forEach { mode ->
            assertThat(ReadingModePreference.of(mode).stickyMode).isEqualTo(mode)
        }
        assertThat(ReadingModePreference.of(null)).isEqualTo(ReadingModePreference.AUTO)
        assertThat(ReadingModePreference.AUTO.stickyMode).isNull()
    }

    @Test
    fun `conversation types fold onto group like iOS`() {
        assertThat(ReadingModeConversationType.of("direct")).isEqualTo(ReadingModeConversationType.DIRECT)
        listOf("group", "community", "channel", "bot", null, "weird").forEach {
            assertThat(ReadingModeConversationType.of(it)).isEqualTo(ReadingModeConversationType.GROUP)
        }
        assertThat(ReadingModeConversationType.of("PUBLIC")).isEqualTo(ReadingModeConversationType.PUBLIC)
    }

    @Test
    fun `storage keys are scoped by reader, hashing a guest id`() {
        val user = ReadingModePreferenceScope.Registered("u1")
        assertThat(ReadingModePreferenceScope.modeKey(user, "c9")).isEqualTo("meeshy_readmode_u_u1_c9")
        assertThat(ReadingModePreferenceScope.lastOpenedKey(user, "c9")).isEqualTo("meeshy_lastopen_u_u1_c9")
        // SHA-256("abc") = ba7816bf8f01cfea…
        assertThat(ReadingModePreferenceScope.Anonymous("abc").storageKey).isEqualTo("a_ba7816bf8f01cfea")
    }
}
