package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * Behavioural coverage for the message-effect flag contract, the effect resolver
 * (port of the `effects` derivation in iOS `MessageModels.swift`), and the
 * `ApiMessage` wire wiring.
 *
 * The bit assignments are the source of truth shared with
 * `packages/shared/types/message-effect-flags.ts` and iOS `MessageEffects.swift`;
 * these tests pin those exact integers so a drift is caught immediately.
 */
class MessageEffectsTest {

    private val json = Json { ignoreUnknownKeys = true }

    // MARK: - Bit assignments (shared wire contract)

    @Test
    fun flagBits_matchSharedContract() {
        assertThat(MessageEffectFlags.EPHEMERAL).isEqualTo(1L)
        assertThat(MessageEffectFlags.BLURRED).isEqualTo(2L)
        assertThat(MessageEffectFlags.VIEW_ONCE).isEqualTo(4L)
        assertThat(MessageEffectFlags.SHAKE).isEqualTo(256L)
        assertThat(MessageEffectFlags.ZOOM).isEqualTo(512L)
        assertThat(MessageEffectFlags.EXPLODE).isEqualTo(1024L)
        assertThat(MessageEffectFlags.CONFETTI).isEqualTo(2048L)
        assertThat(MessageEffectFlags.FIREWORKS).isEqualTo(4096L)
        assertThat(MessageEffectFlags.WAOO).isEqualTo(8192L)
        assertThat(MessageEffectFlags.GLOW).isEqualTo(65536L)
        assertThat(MessageEffectFlags.PULSE).isEqualTo(131072L)
        assertThat(MessageEffectFlags.RAINBOW).isEqualTo(262144L)
        assertThat(MessageEffectFlags.SPARKLE).isEqualTo(524288L)
    }

    // MARK: - Axis predicates (any-bit intersection per axis)

    @Test
    fun hasLifecycle_trueOnlyWhenALifecycleBitSet() {
        assertThat(MessageEffectFlags.hasLifecycle(MessageEffectFlags.BLURRED)).isTrue()
        assertThat(MessageEffectFlags.hasLifecycle(MessageEffectFlags.CONFETTI)).isFalse()
        assertThat(MessageEffectFlags.hasLifecycle(0L)).isFalse()
    }

    @Test
    fun hasAppearance_trueOnlyWhenAnAppearanceBitSet() {
        assertThat(MessageEffectFlags.hasAppearance(MessageEffectFlags.CONFETTI)).isTrue()
        assertThat(MessageEffectFlags.hasAppearance(MessageEffectFlags.EPHEMERAL)).isFalse()
        assertThat(MessageEffectFlags.hasAppearance(MessageEffectFlags.GLOW)).isFalse()
    }

    @Test
    fun hasPersistent_trueOnlyWhenAPersistentBitSet() {
        assertThat(MessageEffectFlags.hasPersistent(MessageEffectFlags.RAINBOW)).isTrue()
        assertThat(MessageEffectFlags.hasPersistent(MessageEffectFlags.SHAKE)).isFalse()
        assertThat(MessageEffectFlags.hasPersistent(0L)).isFalse()
    }

    @Test
    fun hasAny_trueForAnyNonZeroBitfield() {
        assertThat(MessageEffectFlags.hasAny(0L)).isFalse()
        assertThat(MessageEffectFlags.hasAny(MessageEffectFlags.ZOOM)).isTrue()
    }

    @Test
    fun has_requiresFullContainmentOfTheQueriedBit() {
        val combined = MessageEffectFlags.EPHEMERAL or MessageEffectFlags.SHAKE
        assertThat(MessageEffectFlags.has(combined, MessageEffectFlags.EPHEMERAL)).isTrue()
        assertThat(MessageEffectFlags.has(combined, MessageEffectFlags.SHAKE)).isTrue()
        assertThat(MessageEffectFlags.has(combined, MessageEffectFlags.BLURRED)).isFalse()
    }

    @Test
    fun axisPredicates_combinedAcrossAxes() {
        val flags = MessageEffectFlags.EPHEMERAL or
            MessageEffectFlags.SHAKE or
            MessageEffectFlags.GLOW
        assertThat(MessageEffectFlags.hasLifecycle(flags)).isTrue()
        assertThat(MessageEffectFlags.hasAppearance(flags)).isTrue()
        assertThat(MessageEffectFlags.hasPersistent(flags)).isTrue()
    }

    // MARK: - MessageEffects convenience accessors

    @Test
    fun messageEffects_axisAccessorsMirrorFlagPredicates() {
        val effects = MessageEffects(
            flags = MessageEffectFlags.BLURRED or MessageEffectFlags.RAINBOW,
        )
        assertThat(effects.hasLifecycleEffect).isTrue()
        assertThat(effects.hasAppearanceEffect).isFalse()
        assertThat(effects.hasPersistentEffect).isTrue()
        assertThat(effects.has(MessageEffectFlags.RAINBOW)).isTrue()
        assertThat(effects.has(MessageEffectFlags.SHAKE)).isFalse()
    }

    @Test
    fun messageEffects_noEffectsWhenFlagsZero() {
        val none = MessageEffects()
        assertThat(none.hasAnyEffect).isFalse()
        assertThat(none.hasLifecycleEffect).isFalse()
        assertThat(none.hasAppearanceEffect).isFalse()
        assertThat(none.hasPersistentEffect).isFalse()
    }

    // MARK: - Resolver: explicit flags win

    @Test
    fun resolve_usesEffectFlagsWhenPositive() {
        val effects = MessageEffectsResolver.resolve(
            effectFlags = (MessageEffectFlags.CONFETTI or MessageEffectFlags.GLOW).toInt(),
        )
        assertThat(effects.flags).isEqualTo(
            MessageEffectFlags.CONFETTI or MessageEffectFlags.GLOW,
        )
        assertThat(effects.hasAppearanceEffect).isTrue()
        assertThat(effects.hasPersistentEffect).isTrue()
    }

    @Test
    fun resolve_positiveFlagsIgnoreLifecycleBooleans() {
        // iOS: when effectFlags > 0 the boolean/expiry derivation is skipped entirely.
        val effects = MessageEffectsResolver.resolve(
            effectFlags = MessageEffectFlags.SHAKE.toInt(),
            isBlurred = true,
            isViewOnce = true,
            hasExpiry = true,
        )
        assertThat(effects.flags).isEqualTo(MessageEffectFlags.SHAKE)
        assertThat(effects.hasLifecycleEffect).isFalse()
    }

    // MARK: - Resolver: lifecycle derivation fallback

    @Test
    fun resolve_derivesBlurredFromBoolean() {
        val effects = MessageEffectsResolver.resolve(effectFlags = null, isBlurred = true)
        assertThat(effects.flags).isEqualTo(MessageEffectFlags.BLURRED)
    }

    @Test
    fun resolve_derivesViewOnceFromBoolean() {
        val effects = MessageEffectsResolver.resolve(effectFlags = null, isViewOnce = true)
        assertThat(effects.flags).isEqualTo(MessageEffectFlags.VIEW_ONCE)
    }

    @Test
    fun resolve_derivesEphemeralFromExpiry() {
        val effects = MessageEffectsResolver.resolve(effectFlags = null, hasExpiry = true)
        assertThat(effects.flags).isEqualTo(MessageEffectFlags.EPHEMERAL)
    }

    @Test
    fun resolve_combinesAllDerivedLifecycleBits() {
        val effects = MessageEffectsResolver.resolve(
            effectFlags = 0,
            isBlurred = true,
            isViewOnce = true,
            hasExpiry = true,
        )
        assertThat(effects.flags).isEqualTo(
            MessageEffectFlags.BLURRED or
                MessageEffectFlags.VIEW_ONCE or
                MessageEffectFlags.EPHEMERAL,
        )
    }

    @Test
    fun resolve_falseAndNullBooleansYieldNoEffects() {
        val effects = MessageEffectsResolver.resolve(
            effectFlags = null,
            isBlurred = false,
            isViewOnce = null,
            hasExpiry = false,
        )
        assertThat(effects.hasAnyEffect).isFalse()
    }

    @Test
    fun resolve_zeroFlagsFallsThroughToDerivation() {
        // effectFlags == 0 is NOT "> 0" so the boolean branch still applies.
        val effects = MessageEffectsResolver.resolve(effectFlags = 0, isBlurred = true)
        assertThat(effects.flags).isEqualTo(MessageEffectFlags.BLURRED)
    }

    // MARK: - ApiMessage wiring (wire fields now decode & resolve)

    private fun decode(jsonBody: String): ApiMessage = json.decodeFromString(jsonBody)

    @Test
    fun apiMessage_resolvesEffectsFromEffectFlagsField() {
        val msg = decode(
            """{"id":"m1","conversationId":"c1","effectFlags":${MessageEffectFlags.PULSE.toInt()}}""",
        )
        assertThat(msg.effects.flags).isEqualTo(MessageEffectFlags.PULSE)
        assertThat(msg.effects.hasPersistentEffect).isTrue()
    }

    @Test
    fun apiMessage_derivesLifecycleFromBooleanAndExpiryFields() {
        val msg = decode(
            """{"id":"m1","conversationId":"c1","isBlurred":true,"expiresAt":"2026-07-14T00:00:00Z"}""",
        )
        assertThat(msg.effects.flags).isEqualTo(
            MessageEffectFlags.BLURRED or MessageEffectFlags.EPHEMERAL,
        )
    }

    @Test
    fun apiMessage_blankExpiresAtIsNotEphemeral() {
        val msg = decode("""{"id":"m1","conversationId":"c1","expiresAt":"  "}""")
        assertThat(msg.effects.hasAnyEffect).isFalse()
    }

    @Test
    fun apiMessage_absentEffectFieldsYieldNoEffects() {
        val msg = decode("""{"id":"m1","conversationId":"c1","content":"hi"}""")
        assertThat(msg.effects.hasAnyEffect).isFalse()
    }
}
