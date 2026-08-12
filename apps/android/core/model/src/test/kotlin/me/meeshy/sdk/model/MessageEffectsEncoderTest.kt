package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import org.junit.Test

/**
 * Behavioural coverage for the composer-side wire encoding of a message-effects
 * selection — the send-path counterpart to [MessageEffectsResolver] (which decodes
 * a *received* message) and [MessageEffectsEditor] (which edits the selection).
 *
 * Ports the iOS `ConversationViewModel` send-path resolution: a non-empty
 * `pendingEffects` becomes `effectFlags: flags.rawValue` on the wire (else `nil`);
 * the lifecycle bits project to the legacy `isBlurred` / `isViewOnce` booleans; the
 * `EPHEMERAL` bit + chosen duration project to `ephemeralDuration` seconds and a
 * concrete `expiresAt = now + duration` timestamp (iOS `EphemeralDuration.expiresAt`).
 *
 * The single [MessageEffects] value is the SSOT here — every wire field is derived
 * from it, never from scattered composer toggles (a deliberate improvement over the
 * iOS split state).
 */
class MessageEffectsEncoderTest {

    private val now = Instant.parse("2026-07-14T10:00:00Z")

    private fun encode(effects: MessageEffects) = MessageEffectsEncoder.encode(effects, now)

    // MARK: - empty selection → no wire fields

    @Test
    fun encode_emptyEffects_emitsAllNull() {
        val wire = encode(MessageEffects())

        assertThat(wire.effectFlags).isNull()
        assertThat(wire.isBlurred).isNull()
        assertThat(wire.isViewOnce).isNull()
        assertThat(wire.ephemeralDuration).isNull()
        assertThat(wire.expiresAt).isNull()
        assertThat(wire.maxViewOnceCount).isNull()
    }

    // MARK: - effectFlags

    @Test
    fun encode_anyEffect_carriesTheRawBitfield() {
        val wire = encode(MessageEffects(flags = MessageEffectFlags.GLOW))

        assertThat(wire.effectFlags).isEqualTo(MessageEffectFlags.GLOW.toInt())
    }

    @Test
    fun encode_combinedFlags_carriesTheUnion() {
        val flags = MessageEffectFlags.CONFETTI or MessageEffectFlags.RAINBOW or MessageEffectFlags.BLURRED
        val wire = encode(MessageEffects(flags = flags))

        assertThat(wire.effectFlags).isEqualTo(flags.toInt())
    }

    @Test
    fun encode_highestBit_survivesTheIntNarrowing() {
        // SPARKLE is bit 19 — comfortably within Int; pins that narrowing is lossless.
        val wire = encode(MessageEffects(flags = MessageEffectFlags.SPARKLE))

        assertThat(wire.effectFlags).isEqualTo(MessageEffectFlags.SPARKLE.toInt())
    }

    // MARK: - lifecycle booleans (only true, never false — mirrors iOS `? true : nil`)

    @Test
    fun encode_blurred_setsIsBlurredTrueOnly() {
        val wire = encode(MessageEffects(flags = MessageEffectFlags.BLURRED))

        assertThat(wire.isBlurred).isTrue()
        assertThat(wire.isViewOnce).isNull()
    }

    @Test
    fun encode_viewOnce_setsIsViewOnceTrueOnly() {
        val wire = encode(MessageEffects(flags = MessageEffectFlags.VIEW_ONCE))

        assertThat(wire.isViewOnce).isTrue()
        assertThat(wire.isBlurred).isNull()
    }

    @Test
    fun encode_appearanceEffectOnly_leavesLifecycleBooleansNull() {
        // A pure appearance effect (shake) still ships effectFlags, but must NOT
        // spuriously set the blurred/view-once/ephemeral lifecycle wire fields.
        val wire = encode(MessageEffects(flags = MessageEffectFlags.SHAKE))

        assertThat(wire.effectFlags).isEqualTo(MessageEffectFlags.SHAKE.toInt())
        assertThat(wire.isBlurred).isNull()
        assertThat(wire.isViewOnce).isNull()
        assertThat(wire.ephemeralDuration).isNull()
        assertThat(wire.expiresAt).isNull()
    }

    // MARK: - ephemeral → duration + expiresAt

    @Test
    fun encode_ephemeralWithDuration_writesSecondsAndExpiresAt() {
        val wire = encode(
            MessageEffects(
                flags = MessageEffectFlags.EPHEMERAL,
                ephemeralDuration = EphemeralDuration.FIVE_MINUTES.seconds,
            ),
        )

        assertThat(wire.ephemeralDuration).isEqualTo(300)
        assertThat(wire.expiresAt).isEqualTo("2026-07-14T10:05:00Z")
    }

    @Test
    fun encode_ephemeralExpiresAt_isNowPlusDurationSeconds() {
        val wire = encode(
            MessageEffects(
                flags = MessageEffectFlags.EPHEMERAL,
                ephemeralDuration = EphemeralDuration.TWENTY_FOUR_HOURS.seconds,
            ),
        )

        val expiry = isoToEpochMillisOrNull(wire.expiresAt)
        assertThat(expiry).isEqualTo(now.plusSeconds(86400).toEpochMilli())
    }

    @Test
    fun encode_ephemeralFlagWithoutDuration_emitsNoExpiry() {
        // The EPHEMERAL chip can be on before a duration is chosen; without a
        // duration there is nothing to expire against, so no timestamp is invented.
        val wire = encode(MessageEffects(flags = MessageEffectFlags.EPHEMERAL))

        assertThat(wire.effectFlags).isEqualTo(MessageEffectFlags.EPHEMERAL.toInt())
        assertThat(wire.ephemeralDuration).isNull()
        assertThat(wire.expiresAt).isNull()
    }

    @Test
    fun encode_durationWithoutEphemeralFlag_isIgnored() {
        // A stale duration param with the EPHEMERAL chip toggled back off must not
        // leak an expiry — the flag is authoritative, exactly as the resolver reads it.
        val wire = encode(
            MessageEffects(
                flags = MessageEffectFlags.GLOW,
                ephemeralDuration = EphemeralDuration.ONE_HOUR.seconds,
            ),
        )

        assertThat(wire.ephemeralDuration).isNull()
        assertThat(wire.expiresAt).isNull()
    }

    // MARK: - maxViewOnceCount (gated on the VIEW_ONCE bit)

    @Test
    fun encode_viewOnceWithCount_carriesMaxViewOnceCount() {
        val wire = encode(
            MessageEffects(flags = MessageEffectFlags.VIEW_ONCE, maxViewOnceCount = 3),
        )

        assertThat(wire.maxViewOnceCount).isEqualTo(3)
    }

    @Test
    fun encode_countWithoutViewOnceFlag_isIgnored() {
        val wire = encode(
            MessageEffects(flags = MessageEffectFlags.GLOW, maxViewOnceCount = 3),
        )

        assertThat(wire.maxViewOnceCount).isNull()
    }

    // MARK: - full lifecycle combination

    @Test
    fun encode_allLifecycleBits_projectEveryWireField() {
        val flags = MessageEffectFlags.BLURRED or MessageEffectFlags.VIEW_ONCE or MessageEffectFlags.EPHEMERAL
        val wire = encode(
            MessageEffects(
                flags = flags,
                ephemeralDuration = EphemeralDuration.ONE_MINUTE.seconds,
                maxViewOnceCount = 1,
            ),
        )

        assertThat(wire.effectFlags).isEqualTo(flags.toInt())
        assertThat(wire.isBlurred).isTrue()
        assertThat(wire.isViewOnce).isTrue()
        assertThat(wire.ephemeralDuration).isEqualTo(60)
        assertThat(wire.expiresAt).isEqualTo("2026-07-14T10:01:00Z")
        assertThat(wire.maxViewOnceCount).isEqualTo(1)
    }

    // MARK: - round-trip with the resolver (encode/decode are inverses on the flags)

    @Test
    fun encode_thenResolve_reproducesTheOriginalFlags() {
        val original = MessageEffects(
            flags = MessageEffectFlags.PULSE or MessageEffectFlags.VIEW_ONCE or MessageEffectFlags.EPHEMERAL,
            ephemeralDuration = EphemeralDuration.FIVE_MINUTES.seconds,
        )
        val wire = encode(original)

        val resolved = MessageEffectsResolver.resolve(
            effectFlags = wire.effectFlags,
            isBlurred = wire.isBlurred,
            isViewOnce = wire.isViewOnce,
            hasExpiry = !wire.expiresAt.isNullOrBlank(),
        )

        assertThat(resolved.flags).isEqualTo(original.flags)
    }
}
