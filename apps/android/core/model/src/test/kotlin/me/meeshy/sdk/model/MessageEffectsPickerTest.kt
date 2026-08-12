package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage for the composer effects-picker presentation model — the pure
 * SSOT beneath the Compose sheet. Ports the section layout hardcoded in iOS
 * `EffectsPickerView.effectSection` (Comportement / Animation d'entrée / Effet
 * permanent) plus the per-option "active" / per-duration "selected" derivation the
 * iOS View recomputes inline, into a single testable value.
 *
 * The flag bits and section membership are the shared contract with the receive-side
 * [MessageEffectsResolver] and the wire [MessageEffectFlags], so these tests pin them.
 */
class MessageEffectsPickerTest {

    // MARK: - Catalog: section partition & ordering

    @Test
    fun catalog_behaviorSection_holdsLifecycleOptionsInIosOrder() {
        assertThat(MessageEffectOption.inSection(MessageEffectSection.BEHAVIOR))
            .containsExactly(
                MessageEffectOption.EPHEMERAL,
                MessageEffectOption.BLURRED,
                MessageEffectOption.VIEW_ONCE,
            )
            .inOrder()
    }

    @Test
    fun catalog_entrySection_holdsAppearanceOptionsInIosOrder() {
        assertThat(MessageEffectOption.inSection(MessageEffectSection.ENTRY))
            .containsExactly(
                MessageEffectOption.SHAKE,
                MessageEffectOption.ZOOM,
                MessageEffectOption.EXPLODE,
                MessageEffectOption.CONFETTI,
                MessageEffectOption.FIREWORKS,
                MessageEffectOption.WAOO,
            )
            .inOrder()
    }

    @Test
    fun catalog_permanentSection_holdsPersistentOptionsInIosOrder() {
        assertThat(MessageEffectOption.inSection(MessageEffectSection.PERMANENT))
            .containsExactly(
                MessageEffectOption.GLOW,
                MessageEffectOption.PULSE,
                MessageEffectOption.RAINBOW,
                MessageEffectOption.SPARKLE,
            )
            .inOrder()
    }

    @Test
    fun catalog_sectionsRenderInDeclarationOrder() {
        assertThat(MessageEffectSection.entries)
            .containsExactly(
                MessageEffectSection.BEHAVIOR,
                MessageEffectSection.ENTRY,
                MessageEffectSection.PERMANENT,
            )
            .inOrder()
    }

    @Test
    fun catalog_optionFlagsMatchTheWireBitContract() {
        assertThat(MessageEffectOption.EPHEMERAL.flag).isEqualTo(MessageEffectFlags.EPHEMERAL)
        assertThat(MessageEffectOption.BLURRED.flag).isEqualTo(MessageEffectFlags.BLURRED)
        assertThat(MessageEffectOption.VIEW_ONCE.flag).isEqualTo(MessageEffectFlags.VIEW_ONCE)
        assertThat(MessageEffectOption.SHAKE.flag).isEqualTo(MessageEffectFlags.SHAKE)
        assertThat(MessageEffectOption.WAOO.flag).isEqualTo(MessageEffectFlags.WAOO)
        assertThat(MessageEffectOption.GLOW.flag).isEqualTo(MessageEffectFlags.GLOW)
        assertThat(MessageEffectOption.SPARKLE.flag).isEqualTo(MessageEffectFlags.SPARKLE)
    }

    @Test
    fun catalog_coversEveryLifecycleAppearanceAndPersistentBitExactlyOnce() {
        // The catalog is the picker's SSOT: it must expose every effect bit the wire
        // defines (no orphan bit the user cannot pick), and each option's flag is a
        // single distinct bit (no chip toggling two effects at once).
        val union = MessageEffectOption.entries.fold(0L) { acc, option -> acc or option.flag }
        assertThat(union).isEqualTo(
            MessageEffectFlags.LIFECYCLE_MASK or
                MessageEffectFlags.APPEARANCE_MASK or
                MessageEffectFlags.PERSISTENT_MASK,
        )
        assertThat(union.countOneBits()).isEqualTo(MessageEffectOption.entries.size)
        MessageEffectOption.entries.forEach { option ->
            assertThat(option.flag.countOneBits()).isEqualTo(1)
        }
    }

    @Test
    fun catalog_labelKeysAreUniqueAndKeysAreNonBlank() {
        val labelKeys = MessageEffectOption.entries.map { it.labelKey }
        assertThat(labelKeys.toSet()).hasSize(labelKeys.size)
        MessageEffectOption.entries.forEach { option ->
            assertThat(option.labelKey).isNotEmpty()
            assertThat(option.iconKey).isNotEmpty()
        }
    }

    // MARK: - Presenter: empty selection

    @Test
    fun build_emptyEffects_everyChipInactiveNoDurationRowNoSummary() {
        val presentation = MessageEffectsPickerPresenter.build(MessageEffects())

        assertThat(presentation.sections.flatMap { it.options }.none { it.isActive }).isTrue()
        assertThat(presentation.showEphemeralDuration).isFalse()
        assertThat(presentation.ephemeralDurations.none { it.isSelected }).isTrue()
        assertThat(presentation.activeCount).isEqualTo(0)
        assertThat(presentation.showSummary).isFalse()
    }

    @Test
    fun build_preservesSectionOrderAndFullOptionRoster() {
        val presentation = MessageEffectsPickerPresenter.build(MessageEffects())

        assertThat(presentation.sections.map { it.section })
            .containsExactly(
                MessageEffectSection.BEHAVIOR,
                MessageEffectSection.ENTRY,
                MessageEffectSection.PERMANENT,
            )
            .inOrder()
        assertThat(presentation.sections.flatMap { it.options }.map { it.option })
            .containsExactlyElementsIn(MessageEffectOption.entries)
    }

    // MARK: - Presenter: a single active flag

    @Test
    fun build_singleActiveFlag_marksOnlyThatChipAndCountsOne() {
        val effects = MessageEffects(flags = MessageEffectFlags.GLOW)
        val presentation = MessageEffectsPickerPresenter.build(effects)

        val active = presentation.sections.flatMap { it.options }.filter { it.isActive }
        assertThat(active.map { it.option }).containsExactly(MessageEffectOption.GLOW)
        assertThat(presentation.activeCount).isEqualTo(1)
        assertThat(presentation.showSummary).isTrue()
        assertThat(presentation.showEphemeralDuration).isFalse()
    }

    @Test
    fun build_flagsAcrossThreeSections_markEachRespectiveChipActive() {
        val effects = MessageEffects(
            flags = MessageEffectFlags.EPHEMERAL or
                MessageEffectFlags.SHAKE or
                MessageEffectFlags.RAINBOW,
        )
        val presentation = MessageEffectsPickerPresenter.build(effects)

        val active = presentation.sections.flatMap { it.options }.filter { it.isActive }.map { it.option }
        assertThat(active).containsExactly(
            MessageEffectOption.EPHEMERAL,
            MessageEffectOption.SHAKE,
            MessageEffectOption.RAINBOW,
        )
        assertThat(presentation.activeCount).isEqualTo(3)
    }

    // MARK: - Presenter: ephemeral duration row

    @Test
    fun build_ephemeralOnWithoutDuration_showsRowWithNothingSelected() {
        val effects = MessageEffects(flags = MessageEffectFlags.EPHEMERAL)
        val presentation = MessageEffectsPickerPresenter.build(effects)

        assertThat(presentation.showEphemeralDuration).isTrue()
        assertThat(presentation.ephemeralDurations.map { it.duration })
            .containsExactlyElementsIn(EphemeralDuration.entries)
            .inOrder()
        assertThat(presentation.ephemeralDurations.none { it.isSelected }).isTrue()
    }

    @Test
    fun build_ephemeralOnWithDuration_selectsOnlyThatDurationChip() {
        val effects = MessageEffects(
            flags = MessageEffectFlags.EPHEMERAL,
            ephemeralDuration = 60,
        )
        val presentation = MessageEffectsPickerPresenter.build(effects)

        val selected = presentation.ephemeralDurations.filter { it.isSelected }
        assertThat(selected.map { it.duration }).containsExactly(EphemeralDuration.ONE_MINUTE)
    }

    @Test
    fun build_ephemeralOnWithBoundaryDurations_areSelectable() {
        val shortest = MessageEffectsPickerPresenter.build(
            MessageEffects(flags = MessageEffectFlags.EPHEMERAL, ephemeralDuration = 30),
        )
        assertThat(shortest.ephemeralDurations.single { it.isSelected }.duration)
            .isEqualTo(EphemeralDuration.THIRTY_SECONDS)

        val longest = MessageEffectsPickerPresenter.build(
            MessageEffects(flags = MessageEffectFlags.EPHEMERAL, ephemeralDuration = 86400),
        )
        assertThat(longest.ephemeralDurations.single { it.isSelected }.duration)
            .isEqualTo(EphemeralDuration.TWENTY_FOUR_HOURS)
    }

    @Test
    fun build_durationSetButEphemeralFlagOff_hidesRow() {
        // Flag authority mirrors the encoder: a stale duration parameter with the
        // EPHEMERAL chip toggled off must never surface the duration row.
        val effects = MessageEffects(ephemeralDuration = 300)
        val presentation = MessageEffectsPickerPresenter.build(effects)

        assertThat(presentation.showEphemeralDuration).isFalse()
        assertThat(presentation.showSummary).isFalse()
        assertThat(presentation.activeCount).isEqualTo(0)
    }

    // MARK: - Presenter: summary count uses the raw bitfield

    @Test
    fun build_unknownHighBit_countsInSummaryButLightsNoCatalogChip() {
        // activeCount ports iOS `flags.rawValue.nonzeroBitCount` — every set bit,
        // even one with no catalog chip (a future/legacy effect) — so the summary
        // count can exceed the number of lit chips.
        val effects = MessageEffects(flags = 1L shl 30)
        val presentation = MessageEffectsPickerPresenter.build(effects)

        assertThat(presentation.activeCount).isEqualTo(1)
        assertThat(presentation.showSummary).isTrue()
        assertThat(presentation.sections.flatMap { it.options }.none { it.isActive }).isTrue()
    }
}
