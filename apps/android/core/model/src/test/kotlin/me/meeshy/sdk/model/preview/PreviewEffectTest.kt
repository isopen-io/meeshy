package me.meeshy.sdk.model.preview

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversationLastMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.MessageEffectFlags
import org.junit.Test

class PreviewEffectTest {

    private val now = 1_800_000_000_000L
    private val future = "2028-01-01T00:00:00.000Z"
    private val past = "2020-01-01T00:00:00.000Z"

    private fun flags(vararg bits: Long): Int = bits.fold(0L) { acc, bit -> acc or bit }.toInt()

    private fun message(
        effectFlags: Int? = null,
        isBlurred: Boolean = false,
        isViewOnce: Boolean = false,
        isEncrypted: Boolean? = null,
        expiresAt: String? = null,
        messageType: String? = "text",
        callSummary: LastMessageCallSummary? = null,
        attachments: List<ApiMessageAttachment>? = null,
    ) = ApiConversationLastMessage(
        id = "m1",
        content = "Salut",
        senderId = "u-bob",
        messageType = messageType,
        isBlurred = isBlurred,
        isViewOnce = isViewOnce,
        isEncrypted = isEncrypted,
        expiresAt = expiresAt,
        effectFlags = effectFlags,
        callSummary = callSummary,
        attachments = attachments,
    )

    private fun effectOf(message: ApiConversationLastMessage?) = previewEffectOf(message, now)

    @Test
    fun `no message has no effect`() {
        assertThat(effectOf(null)).isNull()
    }

    @Test
    fun `a plain message has no effect`() {
        assertThat(effectOf(message())).isNull()
        assertThat(effectOf(message(effectFlags = 0))).isNull()
    }

    @Test
    fun `a blurred message veils the line and nothing else`() {
        val effect = effectOf(message(isBlurred = true, effectFlags = flags(MessageEffectFlags.GLOW, MessageEffectFlags.SHAKE)))

        assertThat(effect).isEqualTo(PreviewEffect(veil = true, finish = null, entrance = null))
        assertThat(effect).isEqualTo(PreviewEffect.VEILED)
    }

    @Test
    fun `each persistent effect gives its finish`() {
        assertThat(effectOf(message(effectFlags = flags(MessageEffectFlags.GLOW)))?.finish).isEqualTo(PreviewFinish.GLOW)
        assertThat(effectOf(message(effectFlags = flags(MessageEffectFlags.PULSE)))?.finish).isEqualTo(PreviewFinish.PULSE)
        assertThat(effectOf(message(effectFlags = flags(MessageEffectFlags.RAINBOW)))?.finish).isEqualTo(PreviewFinish.RAINBOW)
        assertThat(effectOf(message(effectFlags = flags(MessageEffectFlags.SPARKLE)))?.finish).isEqualTo(PreviewFinish.SPARKLE)
    }

    @Test
    fun `the first persistent effect in bit order wins`() {
        val effect = effectOf(message(effectFlags = flags(MessageEffectFlags.SPARKLE, MessageEffectFlags.RAINBOW, MessageEffectFlags.PULSE)))

        assertThat(effect).isEqualTo(PreviewEffect(veil = false, finish = PreviewFinish.PULSE, entrance = null))
    }

    @Test
    fun `a shake plays a shake entrance`() {
        val effect = effectOf(message(effectFlags = flags(MessageEffectFlags.SHAKE)))

        assertThat(effect).isEqualTo(PreviewEffect(veil = false, finish = null, entrance = PreviewEntrance.SHAKE))
    }

    @Test
    fun `every heavy entrance reduces to a pop`() {
        listOf(
            MessageEffectFlags.ZOOM,
            MessageEffectFlags.EXPLODE,
            MessageEffectFlags.CONFETTI,
            MessageEffectFlags.FIREWORKS,
            MessageEffectFlags.WAOO,
        ).forEach { bit ->
            assertThat(effectOf(message(effectFlags = flags(bit)))?.entrance).isEqualTo(PreviewEntrance.POP)
        }
    }

    @Test
    fun `shake outranks a pop`() {
        val effect = effectOf(message(effectFlags = flags(MessageEffectFlags.CONFETTI, MessageEffectFlags.SHAKE)))

        assertThat(effect?.entrance).isEqualTo(PreviewEntrance.SHAKE)
    }

    @Test
    fun `confetti and sparkle give a sparkle finish and a pop`() {
        val effect = effectOf(message(effectFlags = flags(MessageEffectFlags.CONFETTI, MessageEffectFlags.SPARKLE)))

        assertThat(effect).isEqualTo(PreviewEffect(veil = false, finish = PreviewFinish.SPARKLE, entrance = PreviewEntrance.POP))
    }

    @Test
    fun `shake and glow give a glow finish and a shake`() {
        val effect = effectOf(message(effectFlags = flags(MessageEffectFlags.SHAKE, MessageEffectFlags.GLOW)))

        assertThat(effect).isEqualTo(PreviewEffect(veil = false, finish = PreviewFinish.GLOW, entrance = PreviewEntrance.SHAKE))
    }

    @Test
    fun `an ephemeral message that glows has no effect`() {
        val effect = effectOf(message(effectFlags = flags(MessageEffectFlags.EPHEMERAL, MessageEffectFlags.GLOW), expiresAt = future))

        assertThat(effect).isNull()
    }

    @Test
    fun `an ephemeral awaiting its deadline that glows has no effect`() {
        val effect = effectOf(message(effectFlags = flags(MessageEffectFlags.EPHEMERAL, MessageEffectFlags.GLOW)))

        assertThat(effect).isNull()
    }

    @Test
    fun `an expired message has no effect even when blurred`() {
        assertThat(effectOf(message(effectFlags = flags(MessageEffectFlags.GLOW), expiresAt = past))).isNull()
        assertThat(effectOf(message(isBlurred = true, expiresAt = past))).isNull()
    }

    @Test
    fun `a view once message has no effect`() {
        assertThat(effectOf(message(isViewOnce = true, effectFlags = flags(MessageEffectFlags.SPARKLE)))).isNull()
        assertThat(effectOf(message(effectFlags = flags(MessageEffectFlags.VIEW_ONCE, MessageEffectFlags.SPARKLE)))).isNull()
    }

    @Test
    fun `an encrypted message has no effect even when blurred`() {
        assertThat(effectOf(message(isEncrypted = true, effectFlags = flags(MessageEffectFlags.RAINBOW)))).isNull()
        assertThat(effectOf(message(isEncrypted = true, isBlurred = true))).isNull()
    }

    @Test
    fun `an after read message has no effect`() {
        val effect = effectOf(
            message(effectFlags = flags(MessageEffectFlags.EPHEMERAL, MessageEffectFlags.EPHEMERAL_AFTER_READ, MessageEffectFlags.GLOW)),
        )

        assertThat(effect).isNull()
    }

    @Test
    fun `a blurred bit without the boolean shows no behavioural effect`() {
        assertThat(effectOf(message(effectFlags = flags(MessageEffectFlags.BLURRED, MessageEffectFlags.GLOW)))).isNull()
    }

    @Test
    fun `a masked attachment shows no behavioural effect`() {
        val attachment = ApiMessageAttachment(id = "a1", isBlurred = true)

        assertThat(effectOf(message(effectFlags = flags(MessageEffectFlags.GLOW), attachments = listOf(attachment)))).isNull()
    }

    @Test
    fun `a call or a system line has no effect`() {
        val call = LastMessageCallSummary(callId = "c1", kind = "audio", outcome = "completed", initiatorId = "u-bob")

        assertThat(effectOf(message(effectFlags = flags(MessageEffectFlags.GLOW), callSummary = call))).isNull()
        assertThat(effectOf(message(effectFlags = flags(MessageEffectFlags.GLOW), messageType = "system"))).isNull()
    }

    @Test
    fun `the entrance never exceeds the shared budget`() {
        assertThat(PreviewEffect.ENTRANCE_MAX_MS).isEqualTo(450)
    }
}
