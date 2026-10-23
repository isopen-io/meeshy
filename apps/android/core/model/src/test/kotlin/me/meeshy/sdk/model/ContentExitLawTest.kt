package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ContentExitLaw.CaptureVerdict
import me.meeshy.sdk.model.ContentExitLaw.ForwardVerdict
import me.meeshy.sdk.model.ContentExitLaw.Nature
import org.junit.Test

class ContentExitLawTest {

    private fun law(subject: ContentExitLaw.Subject?) = ContentExitLaw.of(subject)

    private fun subject(
        isViewOnce: Boolean? = null,
        isBlurred: Boolean? = null,
        flags: Long? = null,
        duration: Double? = null,
        hasExpiry: Boolean = false,
        pieces: List<ContentExitLaw.Piece?>? = null,
    ) = ContentExitLaw.Subject(isViewOnce, isBlurred, flags, duration, hasExpiry, pieces)

    @Test
    fun `nothing declared is ordinary - forward free, exportable, capture free`() {
        val result = law(subject())
        assertThat(result.nature).isEqualTo(Nature.ORDINARY)
        assertThat(result.forward).isEqualTo(ForwardVerdict.Allowed(null))
        assertThat(result.exportable).isTrue()
        assertThat(result.capture).isEqualTo(CaptureVerdict.FREE)
        assertThat(law(null)).isEqualTo(ContentExitLaw.Ordinary)
    }

    @Test
    fun `view once refuses every exit and blocks capture`() {
        val result = law(subject(isViewOnce = true))
        assertThat(result.nature).isEqualTo(Nature.VIEW_ONCE)
        assertThat(result.forward).isEqualTo(ForwardVerdict.Refused(ContentExitLaw.ForwardRefusal.VIEW_ONCE))
        assertThat(result.exportable).isFalse()
        assertThat(result.capture).isEqualTo(CaptureVerdict.BLOCKED)
        assertThat(law(subject(flags = MessageEffectFlags.VIEW_ONCE)).nature).isEqualTo(Nature.VIEW_ONCE)
    }

    @Test
    fun `after read flame refuses forward and export but announces the capture`() {
        val flags = MessageEffectFlags.EPHEMERAL or MessageEffectFlags.EPHEMERAL_AFTER_READ
        val result = law(subject(flags = flags))
        assertThat(result.nature).isEqualTo(Nature.AFTER_READ_FLAME)
        assertThat(result.forward).isEqualTo(ForwardVerdict.Refused(ContentExitLaw.ForwardRefusal.AFTER_READ))
        assertThat(result.exportable).isFalse()
        assertThat(result.capture).isEqualTo(CaptureVerdict.ANNOUNCED)
    }

    @Test
    fun `timed flame forwards with the source duration as the bound and nothing else leaves`() {
        val result = law(subject(flags = MessageEffectFlags.EPHEMERAL, duration = 300.0))
        assertThat(result.nature).isEqualTo(Nature.TIMED_FLAME)
        assertThat(result.forward).isEqualTo(ForwardVerdict.Allowed(300))
        assertThat(result.exportable).isFalse()
        assertThat(result.capture).isEqualTo(CaptureVerdict.ANNOUNCED)
    }

    @Test
    fun `an unreadable ephemeral duration closes like after read`() {
        listOf(null, 0.0, -5.0, Double.NaN, Double.POSITIVE_INFINITY, 0.4).forEach { bad ->
            val result = law(subject(flags = MessageEffectFlags.EPHEMERAL, duration = bad))
            assertThat(result.nature).isEqualTo(Nature.AFTER_READ_FLAME)
        }
        assertThat(law(subject(hasExpiry = true)).nature).isEqualTo(Nature.AFTER_READ_FLAME)
    }

    @Test
    fun `a duration alone without any ephemeral declaration is still a timed flame`() {
        assertThat(law(subject(duration = 60.9)).forward).isEqualTo(ForwardVerdict.Allowed(60))
    }

    @Test
    fun `the most restrictive of message and pieces wins`() {
        val viewOncePiece = ContentExitLaw.Piece(isViewOnce = true)
        assertThat(law(subject(pieces = listOf(null, viewOncePiece))).nature).isEqualTo(Nature.VIEW_ONCE)
        val afterReadPiece = ContentExitLaw.Piece(effectFlags = MessageEffectFlags.EPHEMERAL_AFTER_READ)
        assertThat(law(subject(duration = 30.0, pieces = listOf(afterReadPiece))).nature)
            .isEqualTo(Nature.AFTER_READ_FLAME)
        assertThat(law(subject(flags = MessageEffectFlags.EPHEMERAL_AFTER_READ, pieces = listOf(viewOncePiece))).nature)
            .isEqualTo(Nature.VIEW_ONCE)
    }

    @Test
    fun `capture shielding is announced or black - never silent`() {
        assertThat(CaptureVerdict.FREE.shieldsCapture()).isFalse()
        assertThat(CaptureVerdict.ANNOUNCED.shieldsCapture()).isTrue()
        assertThat(CaptureVerdict.ANNOUNCED.shieldsCapture(surfaceAnnounces = true)).isFalse()
        assertThat(CaptureVerdict.BLOCKED.shieldsCapture(surfaceAnnounces = true)).isTrue()
        assertThat(CaptureVerdict.FREE.isDeclared).isFalse()
        assertThat(CaptureVerdict.ANNOUNCED.isDeclared).isTrue()
    }

    @Test
    fun `forwarded copy of a timed flame is bounded by the source and cannot drop the flame`() {
        val source = subject(flags = MessageEffectFlags.EPHEMERAL, duration = 300.0)
        val longer = ContentExitLaw.forwardedCopyProtection(source, ContentExitLaw.CopyRequest(ephemeralDuration = 3600.0))
        assertThat(longer?.ephemeralDuration).isEqualTo(300)
        val shorter = ContentExitLaw.forwardedCopyProtection(source, ContentExitLaw.CopyRequest(ephemeralDuration = 30.0))
        assertThat(shorter?.ephemeralDuration).isEqualTo(30)
        val stripped = ContentExitLaw.forwardedCopyProtection(source, ContentExitLaw.CopyRequest(effectFlags = 0L))
        val bits = MessageEffectFlags.EPHEMERAL or MessageEffectFlags.EPHEMERAL_AFTER_READ
        assertThat(stripped?.effectFlags?.and(bits)).isEqualTo(bits)
        assertThat(stripped?.ephemeralDuration).isEqualTo(300)
    }

    @Test
    fun `forwarded copy inherits blur from message or piece and refuses a protected source`() {
        val blurredPiece = subject(pieces = listOf(ContentExitLaw.Piece(isBlurred = true)))
        val copy = ContentExitLaw.forwardedCopyProtection(blurredPiece, null)
        assertThat(copy?.isBlurred).isTrue()
        assertThat((copy?.effectFlags ?: 0L) and MessageEffectFlags.BLURRED).isEqualTo(MessageEffectFlags.BLURRED)
        assertThat(ContentExitLaw.forwardedCopyProtection(subject(isViewOnce = true), null)).isNull()
        assertThat(ContentExitLaw.forwardedCopyProtection(subject(flags = MessageEffectFlags.EPHEMERAL_AFTER_READ), null)).isNull()
        assertThat(ContentExitLaw.forwardedCopyProtection(subject(), ContentExitLaw.CopyRequest(ephemeralDuration = 60.0))?.ephemeralDuration)
            .isEqualTo(60)
    }

    @Test
    fun `the copy reread as a subject is itself a timed flame`() {
        val source = subject(flags = MessageEffectFlags.EPHEMERAL, duration = 300.0)
        val copy = ContentExitLaw.forwardedCopyProtection(source, null)!!
        assertThat(law(copy.subject).forward).isEqualTo(ForwardVerdict.Allowed(300))
    }

    @Test
    fun `duration choices keep tiers up to the source and put an off-tier source first`() {
        assertThat(ForwardVerdict.Allowed(300).durationChoices.map { it.seconds }).containsExactly(30, 60, 300).inOrder()
        assertThat(ForwardVerdict.Allowed(100).durationChoices.map { it.seconds }).containsExactly(100, 30, 60).inOrder()
        assertThat(ForwardVerdict.Allowed(null).durationChoices).isEmpty()
        assertThat(ForwardVerdict.Refused(ContentExitLaw.ForwardRefusal.VIEW_ONCE).durationChoices).isEmpty()
        assertThat(ForwardDurationChoice(90).label).isEqualTo("1min 30s")
        assertThat(ForwardDurationChoice(7200).label).isEqualTo("2h")
    }

    @Test
    fun `requested duration is brought back to the source`() {
        assertThat(ForwardVerdict.Allowed(300).requestedDuration(chosen = 3600)).isEqualTo(300)
        assertThat(ForwardVerdict.Allowed(300).requestedDuration(chosen = 60)).isEqualTo(60)
        assertThat(ForwardVerdict.Allowed(300).requestedDuration(chosen = null)).isEqualTo(300)
        assertThat(ForwardVerdict.Allowed(null).requestedDuration(chosen = 60)).isNull()
    }

    @Test
    fun `a batch is refused as soon as one message is and otherwise bounded by the longest flame`() {
        val refused = ForwardVerdict.Refused(ContentExitLaw.ForwardRefusal.AFTER_READ)
        assertThat(listOf(ForwardVerdict.Allowed(60), refused).batch()).isEqualTo(refused)
        assertThat(listOf(ForwardVerdict.Allowed(60), ForwardVerdict.Allowed(300), ForwardVerdict.Allowed(null)).batch())
            .isEqualTo(ForwardVerdict.Allowed(300))
        assertThat(emptyList<ForwardVerdict>().batch()).isEqualTo(ForwardVerdict.Allowed(null))
    }
}
