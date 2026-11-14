package me.meeshy.app.conversations.links

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.AffiliateToken
import me.meeshy.sdk.model.TrackingLink
import org.junit.Test

class LinkRowFactsTest {

    private fun tracking(lastClickedAt: String? = null, createdAt: String? = null) =
        TrackingLink(id = "t1", name = "Instagram", lastClickedAt = lastClickedAt, createdAt = createdAt)

    private fun token(createdAt: String? = null, maxUses: Int? = null, currentUses: Int = 0) =
        AffiliateToken(id = "a1", token = "abc", name = "Amis", createdAt = createdAt, maxUses = maxUses, currentUses = currentUses)

    @Test
    fun `a tracking row shows the last click when there is one`() {
        val date = trackingRowDate(tracking(lastClickedAt = "2026-11-10T12:00:00.000Z", createdAt = "2026-10-01T08:00:00.000Z"))
        assertThat(date?.kind).isEqualTo(TrackingRowDateKind.LAST_CLICK)
        assertThat(date?.epochMillis).isEqualTo(1_794_312_000_000L)
    }

    @Test
    fun `a tracking row falls back to its creation date when nobody clicked yet`() {
        val date = trackingRowDate(tracking(createdAt = "2026-10-01T08:00:00.000Z"))
        assertThat(date?.kind).isEqualTo(TrackingRowDateKind.CREATED)
    }

    @Test
    fun `a tracking row with no date at all shows none`() {
        assertThat(trackingRowDate(tracking())).isNull()
        assertThat(trackingRowDate(tracking(lastClickedAt = "n'importe quoi"))).isNull()
    }

    @Test
    fun `a referral row names its creation and its cap only when it has one`() {
        val capped = affiliateRowFacts(token(createdAt = "2026-10-01T08:00:00.000Z", maxUses = 10, currentUses = 3))
        assertThat(capped.createdMillis).isNotNull()
        assertThat(capped.used).isEqualTo(3)
        assertThat(capped.max).isEqualTo(10)
        val open = affiliateRowFacts(token(createdAt = "2026-10-01T08:00:00.000Z", currentUses = 3))
        assertThat(open.used).isNull()
        assertThat(open.max).isNull()
        assertThat(affiliateRowFacts(token(maxUses = 0, currentUses = 2)).max).isNull()
    }

    @Test
    fun `a referral row with neither date nor cap shows nothing`() {
        val facts = affiliateRowFacts(token())
        assertThat(facts).isEqualTo(AffiliateRowFacts(createdMillis = null, used = null, max = null))
    }
}
