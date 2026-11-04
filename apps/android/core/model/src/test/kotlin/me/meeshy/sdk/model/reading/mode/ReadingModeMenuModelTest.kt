package me.meeshy.sdk.model.reading.mode

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode.BUBBLES
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode.FOCAL
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode.RIVER
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode.SCRIPT
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode.SUMMARY
import org.junit.Test

class ReadingModeMenuModelTest {

    private fun caps(
        type: ReadingModeConversationType = ReadingModeConversationType.GROUP,
        count: Int? = 8,
        isAnonymous: Boolean = false,
        flag: Boolean = true,
        river: Boolean = true,
    ) = ReadingModeOrchestrator.resolveCapabilities(isAnonymous, flag, river, type, count)

    private fun menu(
        capabilities: ReadingModeCapabilities = caps(),
        preference: ConversationReadingMode? = null,
        delivered: Set<ConversationReadingMode> = ReadingModeMenuModel.DELIVERED,
    ) = ReadingModeMenuModel.build(capabilities, preference, delivered)

    @Test
    fun `entries come in the order auto focal script bubbles summary river`() {
        assertThat(menu().map { it.choice }).containsExactly(
            ReadingModeChoice.Auto,
            ReadingModeChoice.Mode(FOCAL),
            ReadingModeChoice.Mode(SCRIPT),
            ReadingModeChoice.Mode(BUBBLES),
            ReadingModeChoice.Mode(SUMMARY),
            ReadingModeChoice.Mode(RIVER),
        ).inOrder()
    }

    @Test
    fun `no stored preference checks automatic only`() {
        val checked = menu(preference = null).filter { it.isSelected }
        assertThat(checked.map { it.choice }).containsExactly(ReadingModeChoice.Auto)
    }

    @Test
    fun `a stored preference checks that mode and not automatic`() {
        val checked = menu(preference = BUBBLES).filter { it.isSelected }
        assertThat(checked.map { it.choice }).containsExactly(ReadingModeChoice.Mode(BUBBLES))
    }

    @Test
    fun `river in a direct conversation is disabled with the never reason`() {
        val river = menu(capabilities = caps(type = ReadingModeConversationType.DIRECT, count = 2))
            .first { it.choice == ReadingModeChoice.Mode(RIVER) }
        assertThat(river.isDisabled).isTrue()
        assertThat(river.reason).isEqualTo(LensUnavailableReason.RiverNever)
    }

    @Test
    fun `river below the threshold is disabled with the live numbers`() {
        val river = menu(capabilities = caps(count = 3))
            .first { it.choice == ReadingModeChoice.Mode(RIVER) }
        assertThat(river.isDisabled).isTrue()
        assertThat(river.reason).isEqualTo(LensUnavailableReason.RiverBelowThreshold(5, 3))
    }

    @Test
    fun `river with an unknown count shows the threshold alone`() {
        val river = menu(capabilities = caps(count = null))
            .first { it.choice == ReadingModeChoice.Mode(RIVER) }
        assertThat(river.reason).isEqualTo(LensUnavailableReason.RiverThresholdOnly(5))
    }

    @Test
    fun `an eligible river is selectable and carries no reason`() {
        val river = menu().first { it.choice == ReadingModeChoice.Mode(RIVER) }
        assertThat(river.isDisabled).isFalse()
        assertThat(river.reason).isNull()
    }

    @Test
    fun `automatic is never disabled and bubbles stays selectable`() {
        val entries = menu(capabilities = caps(isAnonymous = true, count = 2))
        assertThat(entries.first { it.choice == ReadingModeChoice.Auto }.isDisabled).isFalse()
        assertThat(entries.first { it.choice == ReadingModeChoice.Mode(BUBBLES) }.isDisabled).isFalse()
    }

    @Test
    fun `summary is disabled for a guest with the generic reason`() {
        val summary = menu(capabilities = caps(isAnonymous = true))
            .first { it.choice == ReadingModeChoice.Mode(SUMMARY) }
        assertThat(summary.isDisabled).isTrue()
        assertThat(summary.reason).isEqualTo(LensUnavailableReason.Generic)
    }

    @Test
    fun `a mode the screen cannot render yet is disabled as not yet rendered`() {
        val focal = menu(delivered = setOf(BUBBLES, SCRIPT))
            .first { it.choice == ReadingModeChoice.Mode(FOCAL) }
        assertThat(focal.isDisabled).isTrue()
        assertThat(focal.reason).isEqualTo(LensUnavailableReason.NotYetRendered)
    }

    @Test
    fun `for a conversation resolves the capabilities from its type and size`() {
        val direct = ReadingModeMenuModel.forConversation(
            conversationType = "direct", memberCount = 2, isAnonymous = false,
            isFlagEnabled = true, isRiverFlagEnabled = true, preference = SCRIPT,
        )
        assertThat(direct.first { it.choice == ReadingModeChoice.Mode(RIVER) }.reason)
            .isEqualTo(LensUnavailableReason.RiverNever)
        assertThat(direct.first { it.isSelected }.choice).isEqualTo(ReadingModeChoice.Mode(SCRIPT))
    }

    @Test
    fun `the preference is null when the decision is automatic and the mode when it is sticky`() {
        val auto = OrchestratorDecision(SCRIPT, OrchestratorDecisionReason.DEFAULT)
        val sticky = OrchestratorDecision(SCRIPT, OrchestratorDecisionReason.STICKY)
        assertThat(ReadingModeMenuModel.preferenceOf(auto)).isNull()
        assertThat(ReadingModeMenuModel.preferenceOf(sticky)).isEqualTo(SCRIPT)
    }
}
