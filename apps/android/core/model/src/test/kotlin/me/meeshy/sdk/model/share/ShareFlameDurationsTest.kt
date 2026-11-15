package me.meeshy.sdk.model.share

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MessageEffectFlags
import org.junit.Test

/** La durée d'une flamme copiée est bornée par la source ; un seul motif de retenue s'affiche. */
class ShareFlameDurationsTest {
    private fun image(id: String = "img", blurred: Boolean? = null) =
        ShareMedia(id = id, mimeType = "image/jpeg", bytes = 1024L, isBlurred = blurred)

    private fun flame(id: String, seconds: Double?, pieces: List<ShareMedia> = emptyList(), blurred: Boolean? = null,
                      encrypted: Boolean = false, cites: Boolean = false) =
        ShareMessage(id = id, text = "x", effectFlags = MessageEffectFlags.EPHEMERAL, ephemeralDuration = seconds,
            pieces = pieces, isBlurred = blurred, encrypted = encrypted, citesProtected = cites)

    private fun plan(vararg messages: ShareMessage) = SharePlanner.plan(ShareEntry.Messages(messages.toList()))

    @Test
    fun `one flame bounds the copy to its own duration`() {
        assertThat(plan(flame("a", 60.0)).flameMaxDurationSeconds).isEqualTo(60)
    }

    @Test
    fun `several flames keep the shortest duration`() {
        assertThat(plan(flame("a", 300.0), flame("b", 30.0), flame("c", 3600.0)).flameMaxDurationSeconds).isEqualTo(30)
    }

    @Test
    fun `a message without flame leaves the duration unbounded`() {
        assertThat(plan(ShareMessage(id = "m", text = "hi")).flameMaxDurationSeconds).isNull()
    }

    @Test
    fun `a withdrawn view once message does not bound the flames that travel`() {
        val p = plan(flame("a", 120.0), ShareMessage(id = "secret", text = "s", isViewOnce = true))
        assertThat(p.flameMaxDurationSeconds).isEqualTo(120)
        assertThat(p.kept).containsExactly("a")
    }

    @Test
    fun `flame wins over blurred over encrypted over cites protected as the single reason per action`() {
        val all = plan(flame("a", 60.0, pieces = listOf(image()), blurred = true, encrypted = true, cites = true))
        assertThat(all.withheldReason(ShareAction.SAVE)).isEqualTo(ShareWithheldReason.FLAME)
        assertThat(all.withheldReason(ShareAction.PUBLISH_POST)).isEqualTo(ShareWithheldReason.FLAME)
        assertThat(all.withheldReason(ShareAction.IMAGER)).isEqualTo(ShareWithheldReason.FLAME)
        assertThat(all.withheld.groupBy { it.action }.values.map { it.size }.distinct()).containsExactly(1)

        val blurredOnly = plan(ShareMessage(id = "b", text = "x", isBlurred = true, encrypted = true, pieces = listOf(image())))
        assertThat(blurredOnly.withheldReason(ShareAction.PUBLISH_STORY)).isEqualTo(ShareWithheldReason.BLURRED)

        val encryptedCites = plan(ShareMessage(id = "e", text = "x", encrypted = true, citesProtected = true, pieces = listOf(image())))
        assertThat(encryptedCites.withheldReason(ShareAction.PUBLISH_POST)).isEqualTo(ShareWithheldReason.ENCRYPTED)
        assertThat(encryptedCites.withheldReason(ShareAction.IMAGER)).isEqualTo(ShareWithheldReason.CITES_PROTECTED)
        assertThat(encryptedCites.withheldReason(ShareAction.SAVE)).isNull()
    }

    @Test
    fun `a withheld action is not offered`() {
        val p = plan(flame("a", 60.0, pieces = listOf(image())))
        p.withheld.forEach { assertThat(p.offers(it.action)).isFalse() }
        assertThat(p.offers(ShareAction.SEND)).isTrue()
    }

    @Test
    fun `a blurred piece alone makes the copy blurred`() {
        val p = plan(ShareMessage(id = "m", text = "x", pieces = listOf(image(blurred = true))))
        assertThat(p.blurInherited).isTrue()
        assertThat(p.withheldReason(ShareAction.SAVE)).isEqualTo(ShareWithheldReason.BLURRED)
    }
}
