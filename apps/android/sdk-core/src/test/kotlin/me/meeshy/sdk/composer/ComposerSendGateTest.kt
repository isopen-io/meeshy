package me.meeshy.sdk.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for the pure composer send gate (feature-parity §Chat
 * "Composer affordances gated by the viewer's send permissions" + "slow mode").
 *
 * The gate is the single verdict every send path (text, clipboard, picked file,
 * voice) consults before delivering a message: it folds the viewer's per-kind
 * [ComposerAffordances] and the conversation's live [SlowModeState] into one
 * [SendDecision]. Capability wins over cooldown — a denied guest is blocked
 * regardless of the timer, and only a *permitted* kind is ever throttled.
 *
 * SOTA over iOS, whose composer applies neither `ParticipantPermissions` nor a
 * slow-mode cooldown to the send action, and where the attachment path bypasses
 * both entirely. Every expectation is a hand-written literal asserted through the
 * public API, never the input echoed back.
 */
class ComposerSendGateTest {

    private fun affordances(
        text: Boolean = true,
        images: Boolean = true,
        files: Boolean = true,
        videos: Boolean = true,
        audios: Boolean = true,
        locations: Boolean = true,
        links: Boolean = true,
    ) = ComposerAffordances(
        canSendText = text,
        canSendImages = images,
        canSendFiles = files,
        canSendVideos = videos,
        canSendAudios = audios,
        canSendLocations = locations,
        canSendLinks = links,
    )

    private val unthrottled = SlowModeState.UNTHROTTLED
    private fun cooldown(seconds: Int) =
        SlowModeState(isActive = true, canSend = false, remainingSeconds = seconds)

    // MARK: - fully permitted + unthrottled → allowed for every kind

    @Test
    fun `a full composer with no cooldown permits every send kind`() {
        ComposerSendKind.entries.forEach { kind ->
            val decision = ComposerSendGate.evaluate(kind, affordances(), unthrottled)
            assertThat(decision.allowed).isTrue()
            assertThat(decision.blockReason).isNull()
            assertThat(decision.cooldownSeconds).isEqualTo(0)
        }
    }

    // MARK: - read-only posture

    @Test
    fun `a text-denied composer blocks a text send as read-only`() {
        val decision = ComposerSendGate.evaluate(ComposerSendKind.TEXT, affordances(text = false), unthrottled)

        assertThat(decision.allowed).isFalse()
        assertThat(decision.blockReason).isEqualTo(SendBlockReason.READ_ONLY)
        assertThat(decision.cooldownSeconds).isEqualTo(0)
    }

    // MARK: - per-kind capability gating

    @Test
    fun `a denied image capability blocks an image send`() {
        val decision = ComposerSendGate.evaluate(ComposerSendKind.IMAGE, affordances(images = false), unthrottled)

        assertThat(decision.allowed).isFalse()
        assertThat(decision.blockReason).isEqualTo(SendBlockReason.CAPABILITY_DENIED)
        assertThat(decision.cooldownSeconds).isEqualTo(0)
    }

    @Test
    fun `a denied file capability blocks a file send`() {
        val decision = ComposerSendGate.evaluate(ComposerSendKind.FILE, affordances(files = false), unthrottled)

        assertThat(decision.allowed).isFalse()
        assertThat(decision.blockReason).isEqualTo(SendBlockReason.CAPABILITY_DENIED)
    }

    @Test
    fun `a denied video capability blocks a video send`() {
        val decision = ComposerSendGate.evaluate(ComposerSendKind.VIDEO, affordances(videos = false), unthrottled)

        assertThat(decision.blockReason).isEqualTo(SendBlockReason.CAPABILITY_DENIED)
    }

    @Test
    fun `a denied audio capability blocks a voice send`() {
        val decision = ComposerSendGate.evaluate(ComposerSendKind.AUDIO, affordances(audios = false), unthrottled)

        assertThat(decision.blockReason).isEqualTo(SendBlockReason.CAPABILITY_DENIED)
    }

    @Test
    fun `a denied location capability blocks a location send`() {
        val decision = ComposerSendGate.evaluate(ComposerSendKind.LOCATION, affordances(locations = false), unthrottled)

        assertThat(decision.blockReason).isEqualTo(SendBlockReason.CAPABILITY_DENIED)
    }

    @Test
    fun `a text-denied composer still permits a granted image kind`() {
        // Read-only is the TEXT-denied case only; an asymmetric permission set that
        // grants images keeps the image path open.
        val decision = ComposerSendGate.evaluate(ComposerSendKind.IMAGE, affordances(text = false), unthrottled)

        assertThat(decision.allowed).isTrue()
    }

    // MARK: - slow-mode cooldown (only on a permitted kind)

    @Test
    fun `a running cooldown blocks a permitted send and surfaces the remaining seconds`() {
        val decision = ComposerSendGate.evaluate(ComposerSendKind.TEXT, affordances(), cooldown(17))

        assertThat(decision.allowed).isFalse()
        assertThat(decision.blockReason).isEqualTo(SendBlockReason.SLOW_MODE_COOLDOWN)
        assertThat(decision.cooldownSeconds).isEqualTo(17)
    }

    @Test
    fun `a running cooldown blocks a permitted file send too`() {
        val decision = ComposerSendGate.evaluate(ComposerSendKind.FILE, affordances(), cooldown(30))

        assertThat(decision.blockReason).isEqualTo(SendBlockReason.SLOW_MODE_COOLDOWN)
        assertThat(decision.cooldownSeconds).isEqualTo(30)
    }

    // MARK: - precedence: capability denial wins over the cooldown

    @Test
    fun `a denied capability outranks a running cooldown`() {
        val decision = ComposerSendGate.evaluate(ComposerSendKind.FILE, affordances(files = false), cooldown(30))

        assertThat(decision.blockReason).isEqualTo(SendBlockReason.CAPABILITY_DENIED)
        // No timer leaks through when the block is a hard permission denial.
        assertThat(decision.cooldownSeconds).isEqualTo(0)
    }

    @Test
    fun `read-only outranks a running cooldown on the text path`() {
        val decision = ComposerSendGate.evaluate(ComposerSendKind.TEXT, affordances(text = false), cooldown(5))

        assertThat(decision.blockReason).isEqualTo(SendBlockReason.READ_ONLY)
        assertThat(decision.cooldownSeconds).isEqualTo(0)
    }

    // MARK: - message-type → kind mapping (the attachment path's classifier)

    @Test
    fun `the gateway message-type label maps to its send kind`() {
        assertThat(ComposerSendKind.fromMessageType("image")).isEqualTo(ComposerSendKind.IMAGE)
        assertThat(ComposerSendKind.fromMessageType("video")).isEqualTo(ComposerSendKind.VIDEO)
        assertThat(ComposerSendKind.fromMessageType("audio")).isEqualTo(ComposerSendKind.AUDIO)
        assertThat(ComposerSendKind.fromMessageType("file")).isEqualTo(ComposerSendKind.FILE)
    }

    @Test
    fun `an unknown or null message-type label falls back to the generic file kind`() {
        assertThat(ComposerSendKind.fromMessageType("sticker")).isEqualTo(ComposerSendKind.FILE)
        assertThat(ComposerSendKind.fromMessageType(null)).isEqualTo(ComposerSendKind.FILE)
        assertThat(ComposerSendKind.fromMessageType("")).isEqualTo(ComposerSendKind.FILE)
    }
}
