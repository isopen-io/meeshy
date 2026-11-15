package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Pure decision core of the two-way row swipe — iOS `BubbleSwipeResistance` + `MessageRowOffer`:
 * reply on the side that points back at the sender, forward on the other, a rubber-banded track,
 * a refused side capped under the threshold, one haptic per crossing, commit on release.
 */
class SwipeRowLawTest {

    private val both = SwipeRowSides(canReply = true, canForward = true)
    private val replyOnly = SwipeRowSides(canReply = true, canForward = false)
    private val forwardOnly = SwipeRowSides(canReply = false, canForward = true)
    private val none = SwipeRowSides(canReply = false, canForward = false)

    // ---- direction ---------------------------------------------------------

    @Test
    fun a_received_bubble_replies_to_the_right_and_forwards_to_the_left() {
        val direction = replyDirection(isOutgoing = false)
        assertThat(SwipeRowLaw.committed(70f, direction, both)).isEqualTo(SwipeRowAction.Reply)
        assertThat(SwipeRowLaw.committed(-70f, direction, both)).isEqualTo(SwipeRowAction.Forward)
    }

    @Test
    fun my_own_bubble_replies_to_the_left_and_forwards_to_the_right() {
        val direction = replyDirection(isOutgoing = true)
        assertThat(SwipeRowLaw.committed(-70f, direction, both)).isEqualTo(SwipeRowAction.Reply)
        assertThat(SwipeRowLaw.committed(70f, direction, both)).isEqualTo(SwipeRowAction.Forward)
    }

    @Test
    fun the_side_of_an_offset_follows_the_reply_direction() {
        assertThat(SwipeRowLaw.sideOf(10f, ReplyDirection.FromIncoming)).isEqualTo(SwipeRowAction.Reply)
        assertThat(SwipeRowLaw.sideOf(10f, ReplyDirection.FromOwn)).isEqualTo(SwipeRowAction.Forward)
        assertThat(SwipeRowLaw.sideOf(0f, ReplyDirection.FromOwn)).isNull()
    }

    // ---- track -------------------------------------------------------------

    @Test
    fun inside_the_action_zone_the_row_tracks_the_finger_one_to_one_both_ways() {
        assertThat(SwipeRowLaw.trackedOffset(40f)).isEqualTo(40f)
        assertThat(SwipeRowLaw.trackedOffset(-40f)).isEqualTo(-40f)
        assertThat(SwipeRowLaw.trackedOffset(72f)).isEqualTo(72f)
    }

    @Test
    fun past_the_zone_the_extra_travel_is_rubber_banded_symmetrically() {
        val expected = 72f + (100f - 72f) * 0.15f
        assertThat(SwipeRowLaw.trackedOffset(100f)).isEqualTo(expected)
        assertThat(SwipeRowLaw.trackedOffset(-100f)).isEqualTo(-expected)
    }

    // ---- refused side --------------------------------------------------------

    @Test
    fun a_refused_forward_side_stops_at_the_stamp_reach() {
        val offset = SwipeRowLaw.offset(-200f, ReplyDirection.FromIncoming, replyOnly)
        assertThat(offset).isEqualTo(-SwipeRowLaw.STAMP_REACH)
        assertThat(SwipeRowLaw.crossesThreshold(offset)).isFalse()
        assertThat(SwipeRowLaw.committed(offset, ReplyDirection.FromIncoming, replyOnly)).isNull()
    }

    @Test
    fun a_refused_reply_side_stops_at_the_stamp_reach_but_forward_still_commits() {
        val reply = SwipeRowLaw.offset(-200f, ReplyDirection.FromOwn, forwardOnly)
        assertThat(reply).isEqualTo(-SwipeRowLaw.STAMP_REACH)
        val forward = SwipeRowLaw.offset(200f, ReplyDirection.FromOwn, forwardOnly)
        assertThat(SwipeRowLaw.committed(forward, ReplyDirection.FromOwn, forwardOnly))
            .isEqualTo(SwipeRowAction.Forward)
    }

    @Test
    fun a_refused_side_under_the_stamp_reach_still_follows_the_finger() {
        assertThat(SwipeRowLaw.offset(-30f, ReplyDirection.FromIncoming, replyOnly)).isEqualTo(-30f)
    }

    @Test
    fun no_side_offered_means_the_gesture_is_not_mounted() {
        assertThat(none.armsAnySide).isFalse()
        assertThat(replyOnly.armsAnySide).isTrue()
    }

    // ---- threshold + haptic -------------------------------------------------

    @Test
    fun the_threshold_is_66_and_65_never_commits() {
        assertThat(SwipeRowLaw.committed(65f, ReplyDirection.FromIncoming, both)).isNull()
        assertThat(SwipeRowLaw.committed(66f, ReplyDirection.FromIncoming, both)).isEqualTo(SwipeRowAction.Reply)
        assertThat(SwipeRowLaw.committed(-66f, ReplyDirection.FromIncoming, both)).isEqualTo(SwipeRowAction.Forward)
    }

    @Test
    fun crossing_fires_the_haptic_once_and_re_arms_after_relaxing() {
        val d = ReplyDirection.FromIncoming
        val first = SwipeRowLaw.onDrag(SwipeRowState(), -80f, d, both)
        assertThat(first.armedHaptic).isTrue()
        val held = SwipeRowLaw.onDrag(first.state, -120f, d, both)
        assertThat(held.armedHaptic).isFalse()
        val relaxed = SwipeRowLaw.onDrag(held.state, -30f, d, both)
        assertThat(relaxed.state.isArmed).isFalse()
        assertThat(relaxed.armedHaptic).isFalse()
        val again = SwipeRowLaw.onDrag(relaxed.state, -90f, d, both)
        assertThat(again.armedHaptic).isTrue()
    }

    @Test
    fun a_refused_side_never_fires_the_haptic() {
        val drag = SwipeRowLaw.onDrag(SwipeRowState(), -300f, ReplyDirection.FromIncoming, replyOnly)
        assertThat(drag.armedHaptic).isFalse()
        assertThat(drag.state.isArmed).isFalse()
    }

    @Test
    fun releasing_short_of_the_threshold_does_nothing() {
        val short = SwipeRowLaw.onDrag(SwipeRowState(), 40f, ReplyDirection.FromIncoming, both).state
        assertThat(SwipeRowLaw.committed(short.offset, ReplyDirection.FromIncoming, both)).isNull()
    }

    // ---- engagement ---------------------------------------------------------

    @Test
    fun a_normal_bubble_engages_past_22_when_frankly_horizontal() {
        assertThat(SwipeRowLaw.shouldEngage(23f, 5f, SwipeResistance.Normal)).isTrue()
        assertThat(SwipeRowLaw.shouldEngage(22f, 0f, SwipeResistance.Normal)).isFalse()
        assertThat(SwipeRowLaw.shouldEngage(30f, 10f, SwipeResistance.Normal)).isFalse()
    }

    @Test
    fun a_resistant_bubble_needs_48_and_a_four_to_one_ratio() {
        assertThat(SwipeRowLaw.shouldEngage(40f, 0f, SwipeResistance.Resistant)).isFalse()
        assertThat(SwipeRowLaw.shouldEngage(60f, 14f, SwipeResistance.Resistant)).isTrue()
        assertThat(SwipeRowLaw.shouldEngage(60f, 16f, SwipeResistance.Resistant)).isFalse()
    }

    // ---- indicator ----------------------------------------------------------

    @Test
    fun the_indicator_sits_on_the_edge_the_row_frees() {
        assertThat(SwipeRowLaw.indicatorEdge(40f)).isEqualTo(SwipeIndicatorEdge.Start)
        assertThat(SwipeRowLaw.indicatorEdge(-40f)).isEqualTo(SwipeIndicatorEdge.End)
    }

    @Test
    fun the_indicator_appears_past_8_and_is_opaque_from_24() {
        assertThat(SwipeRowLaw.indicatorAlpha(8f)).isEqualTo(0f)
        assertThat(SwipeRowLaw.indicatorAlpha(12f)).isEqualTo(0.5f)
        assertThat(SwipeRowLaw.indicatorAlpha(-30f)).isEqualTo(1f)
    }

    @Test
    fun the_glyph_replaces_the_stamp_only_past_the_threshold_on_an_offered_side() {
        val d = ReplyDirection.FromIncoming
        assertThat(SwipeRowLaw.showsActionGlyph(50f, d, both)).isFalse()
        assertThat(SwipeRowLaw.showsActionGlyph(-70f, d, both)).isTrue()
        assertThat(SwipeRowLaw.showsActionGlyph(-70f, d, replyOnly)).isFalse()
    }
}

class SwipeRowReadingDirectionTest {
    @Test
    fun `en LTR le delta de lecture est l identite`() {
        assertThat(swipeReadingDelta(40f, isRtl = false)).isEqualTo(40f)
    }

    @Test
    fun `en RTL un glissement vers la gauche repond a un message entrant`() {
        val reading = swipeReadingDelta(-80f, isRtl = true)
        val offset = SwipeRowLaw.offset(reading, ReplyDirection.FromIncoming, SwipeRowSides(true, true))
        assertThat(SwipeRowLaw.committed(offset, ReplyDirection.FromIncoming, SwipeRowSides(true, true)))
            .isEqualTo(SwipeRowAction.Reply)
    }

    @Test
    fun `en RTL un glissement vers la droite transfere un message entrant`() {
        val reading = swipeReadingDelta(80f, isRtl = true)
        val offset = SwipeRowLaw.offset(reading, ReplyDirection.FromIncoming, SwipeRowSides(true, true))
        assertThat(SwipeRowLaw.committed(offset, ReplyDirection.FromIncoming, SwipeRowSides(true, true)))
            .isEqualTo(SwipeRowAction.Forward)
    }
}
