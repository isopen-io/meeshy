package me.meeshy.sdk.model.relation

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class OurCircleTest {
    private fun link(effective: RelationLevel, mine: RelationLevel = effective) =
        RelationLink(userId = "u1", effectiveLevel = effective, grantedByMe = mine)

    @Test
    fun `when I grant more than the common level, the other grants exactly the common level`() {
        val grants = RelationGrants.of(link(effective = RelationLevel.CLOSE, mine = RelationLevel.BLOOD))
        assertThat(grants.common).isEqualTo(RelationLevel.CLOSE)
        assertThat(grants.mine).isEqualTo(RelationLevel.BLOOD)
        assertThat(grants.theirs).isEqualTo(RelationLevel.CLOSE)
        assertThat(grants.theirsAtLeast).isFalse()
    }

    @Test
    fun `when I grant the common level, the other grants at least that level and the server does not say more`() {
        val grants = RelationGrants.of(link(effective = RelationLevel.CLOSE, mine = RelationLevel.CLOSE))
        assertThat(grants.theirs).isEqualTo(RelationLevel.CLOSE)
        assertThat(grants.theirsAtLeast).isTrue()
    }

    @Test
    fun `a close circle opens its tools and shows what Sang adds, locked`() {
        val view = OurCircleView.of(link(effective = RelationLevel.CLOSE))
        assertThat(view.level).isEqualTo(RelationLevel.CLOSE)
        assertThat(view.open).containsAtLeast(RelationFeature.TALKIE, RelationFeature.DEVICE_BATTERY, RelationFeature.DEVICE_UNREACHABLE, RelationFeature.BRING)
        assertThat(view.open).doesNotContain(RelationFeature.LOCATION_LIVE)
        assertThat(view.next).isEqualTo(RelationLevel.BLOOD)
        assertThat(view.locked).containsExactly(
            RelationFeature.LOCATION_LIVE,
            RelationFeature.LOCATION_HISTORY,
            RelationFeature.LOCATION_PROXIMITY,
            RelationFeature.DEVICE_BATTERY_PULL,
        )
    }

    @Test
    fun `what is locked is exactly what the next rung opens, never a feature two rungs away`() {
        val view = OurCircleView.of(link(effective = RelationLevel.FRIEND))
        assertThat(view.next).isEqualTo(RelationLevel.CLOSE)
        view.locked.forEach { assertThat(RelationOpenings.opensAt(it)).isEqualTo(RelationLevel.CLOSE) }
        assertThat(view.locked).doesNotContain(RelationFeature.LOCATION_LIVE)
    }

    @Test
    fun `if I already grant the next rung, what is missing is that the other grants it`() {
        val view = OurCircleView.of(link(effective = RelationLevel.CLOSE, mine = RelationLevel.BLOOD))
        assertThat(view.missing).isEqualTo(OurCircleMissing.TheyMustGrant(RelationLevel.BLOOD))
    }

    @Test
    fun `if I do not yet grant the next rung, what is missing is my own grant`() {
        val view = OurCircleView.of(link(effective = RelationLevel.CLOSE, mine = RelationLevel.CLOSE))
        assertThat(view.missing).isEqualTo(OurCircleMissing.YouMustGrant(RelationLevel.BLOOD))
    }

    @Test
    fun `at the top there is no next rung, no locked row and nothing missing`() {
        val view = OurCircleView.of(link(effective = RelationLevel.BLOOD))
        assertThat(view.next).isNull()
        assertThat(view.locked).isEmpty()
        assertThat(view.missing).isEqualTo(OurCircleMissing.None)
    }
}
