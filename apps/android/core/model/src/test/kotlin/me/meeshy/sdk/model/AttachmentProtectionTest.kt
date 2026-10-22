package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * La protection DÉCLARÉE par la pièce jointe elle-même — miroir de
 * `maskedAttachment` / `attachmentProtectionOf`
 * (`packages/shared/utils/attachment-protection.ts`, le TypeScript fait foi) et de
 * `APIMessageAttachment.declaredProtection` (iOS).
 *
 * Une pièce porte SES PROPRES `isViewOnce` / `isBlurred` / `effectFlags`,
 * indépendants de ceux du message. Les trois canaux sont un OU, jamais une
 * cascade : une charge qui ne porterait que le bitfield est retenue quand même.
 * Et sur un secret, le doute se tranche FERMÉ.
 */
class AttachmentProtectionTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private fun decode(body: String): ApiMessageAttachment =
        json.decodeFromString<ApiMessageAttachment>("""{"id":"a1","mimeType":"image/jpeg"$body}""")

    private fun verdict(isViewOnce: Boolean? = null, isBlurred: Boolean? = null, effectFlags: Long? = null) =
        AttachmentProtection.verdict(isViewOnce, isBlurred, effectFlags)

    @Test
    fun `a view once attachment is masked`() {
        assertThat(verdict(isViewOnce = true)).isEqualTo(AttachmentProtectionVerdict.Masked)
    }

    @Test
    fun `a blurred attachment is masked`() {
        assertThat(verdict(isBlurred = true)).isEqualTo(AttachmentProtectionVerdict.Masked)
    }

    @Test
    fun `the view once bit alone masks even when both booleans say no`() {
        assertThat(verdict(isViewOnce = false, isBlurred = false, effectFlags = MessageEffectFlags.VIEW_ONCE))
            .isEqualTo(AttachmentProtectionVerdict.Masked)
    }

    @Test
    fun `the blurred bit alone masks`() {
        assertThat(verdict(isViewOnce = false, isBlurred = false, effectFlags = MessageEffectFlags.BLURRED))
            .isEqualTo(AttachmentProtectionVerdict.Masked)
    }

    @Test
    fun `decorative effect bits do not mask`() {
        val decorative = MessageEffectFlags.SHAKE or MessageEffectFlags.GLOW or MessageEffectFlags.CONFETTI
        assertThat(verdict(isViewOnce = false, isBlurred = false, effectFlags = decorative))
            .isEqualTo(AttachmentProtectionVerdict.Open)
    }

    @Test
    fun `the ephemeral bit alone does not mask the file - only view once and blur do`() {
        assertThat(verdict(effectFlags = MessageEffectFlags.EPHEMERAL)).isEqualTo(AttachmentProtectionVerdict.Open)
    }

    @Test
    fun `a masking bit mixed with decorative ones still masks`() {
        assertThat(verdict(effectFlags = MessageEffectFlags.GLOW or MessageEffectFlags.VIEW_ONCE))
            .isEqualTo(AttachmentProtectionVerdict.Masked)
    }

    @Test
    fun `an attachment that declares nothing masking is open`() {
        assertThat(verdict(isViewOnce = false, isBlurred = false, effectFlags = 0))
            .isEqualTo(AttachmentProtectionVerdict.Open)
    }

    @Test
    fun `one declared quiet channel is enough to call the attachment open`() {
        assertThat(verdict(isViewOnce = false)).isEqualTo(AttachmentProtectionVerdict.Open)
        assertThat(verdict(effectFlags = 0)).isEqualTo(AttachmentProtectionVerdict.Open)
    }

    @Test
    fun `a wire that says nothing on any channel is undeclared`() {
        assertThat(verdict()).isEqualTo(AttachmentProtectionVerdict.Undeclared)
    }

    @Test
    fun `undeclared is protected - the doubt resolves closed`() {
        assertThat(AttachmentProtection.isProtected(null, null, null)).isTrue()
        assertThat(AttachmentProtection.isProtected(true, null, null)).isTrue()
        assertThat(AttachmentProtection.isProtected(false, false, 0)).isFalse()
    }

    @Test
    fun `the declared protection is null on silence and never a fabricated false`() {
        assertThat(AttachmentProtection.declaredProtection(null, null, null)).isNull()
        assertThat(AttachmentProtection.declaredProtection(false, false, null)).isFalse()
        assertThat(AttachmentProtection.declaredProtection(false, true, null)).isTrue()
        assertThat(AttachmentProtection.declaredProtection(null, null, MessageEffectFlags.BLURRED)).isTrue()
    }

    // ── La pièce décodée du fil ──────────────────────────────────────────────

    @Test
    fun `a decoded view once attachment is masked`() {
        val attachment = decode(""","isViewOnce":true,"isBlurred":false,"effectFlags":4""")
        assertThat(attachment.protectionVerdict).isEqualTo(AttachmentProtectionVerdict.Masked)
        assertThat(attachment.isProtected).isTrue()
        assertThat(attachment.declaredProtection).isTrue()
    }

    @Test
    fun `a decoded plain attachment is open`() {
        val attachment = decode(""","isViewOnce":false,"isBlurred":false,"effectFlags":0""")
        assertThat(attachment.protectionVerdict).isEqualTo(AttachmentProtectionVerdict.Open)
        assertThat(attachment.isProtected).isFalse()
        assertThat(attachment.declaredProtection).isFalse()
    }

    @Test
    fun `a decoded attachment from before the field existed is undeclared and therefore protected`() {
        val attachment = decode("")
        assertThat(attachment.protectionVerdict).isEqualTo(AttachmentProtectionVerdict.Undeclared)
        assertThat(attachment.isProtected).isTrue()
        assertThat(attachment.declaredProtection).isNull()
    }

    @Test
    fun `a decoded attachment carrying only the bitfield is still masked`() {
        val attachment = decode(""","effectFlags":2""")
        assertThat(attachment.isProtected).isTrue()
        assertThat(attachment.declaredProtection).isTrue()
    }

    @Test
    fun `a malformed boolean channel decodes closed instead of dropping the attachment`() {
        val attachment = decode(""","isViewOnce":{"weird":1},"isBlurred":false""")
        assertThat(attachment.id).isEqualTo("a1")
        assertThat(attachment.isViewOnce).isTrue()
        assertThat(attachment.protectionVerdict).isEqualTo(AttachmentProtectionVerdict.Masked)
    }

    @Test
    fun `a boolean channel written as a string is a wrong type and decodes closed`() {
        assertThat(decode(",\"isBlurred\":\"yes\"").isBlurred).isTrue()
        assertThat(decode(",\"isViewOnce\":\"false\"").isViewOnce).isTrue()
    }

    @Test
    fun `a boolean channel written as a number is a wrong type and decodes closed`() {
        assertThat(decode(",\"isViewOnce\":0").isViewOnce).isTrue()
        assertThat(decode(",\"isBlurred\":1").isBlurred).isTrue()
    }

    @Test
    fun `a bitfield written as a string is a wrong type and decodes to the masking bits`() {
        val attachment = decode(",\"effectFlags\":\"not-a-number\"")
        assertThat(attachment.id).isEqualTo("a1")
        assertThat(attachment.effectFlags).isEqualTo(AttachmentProtection.MASKING_FLAGS)
        assertThat(attachment.isProtected).isTrue()
    }

    @Test
    fun `a fractional bitfield decodes closed`() {
        assertThat(decode(""","effectFlags":2.5""").effectFlags).isEqualTo(AttachmentProtection.MASKING_FLAGS)
    }

    @Test
    fun `a bitfield beyond the signed range survives as a long`() {
        val unsigned = 0xFFFF_FFFFL
        assertThat(decode(""","effectFlags":$unsigned""").effectFlags).isEqualTo(unsigned)
    }

    @Test
    fun `null channels are the same as absent channels`() {
        val attachment = decode(""","isViewOnce":null,"isBlurred":null,"effectFlags":null""")
        assertThat(attachment.isViewOnce).isNull()
        assertThat(attachment.isBlurred).isNull()
        assertThat(attachment.effectFlags).isNull()
        assertThat(attachment.protectionVerdict).isEqualTo(AttachmentProtectionVerdict.Undeclared)
    }

    @Test
    fun `the three channels survive the cache round trip`() {
        val attachment = decode(""","isViewOnce":true,"isBlurred":false,"effectFlags":4""")
        val again = json.decodeFromString<ApiMessageAttachment>(json.encodeToString(ApiMessageAttachment.serializer(), attachment))
        assertThat(again.isViewOnce).isTrue()
        assertThat(again.isBlurred).isFalse()
        assertThat(again.effectFlags).isEqualTo(4L)
        assertThat(again.protectionVerdict).isEqualTo(AttachmentProtectionVerdict.Masked)
    }

    @Test
    fun `the domain attachment states its booleans so it is never undeclared`() {
        val plain = MeeshyMessageAttachment(id = "m1")
        assertThat(plain.protectionVerdict).isEqualTo(AttachmentProtectionVerdict.Open)
        assertThat(plain.copy(isBlurred = true).protectionVerdict).isEqualTo(AttachmentProtectionVerdict.Masked)
        assertThat(plain.copy(effectFlags = MessageEffectFlags.VIEW_ONCE).isProtected).isTrue()
    }
}
