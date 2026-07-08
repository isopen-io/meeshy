package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Pure decision core behind the swipe-to-reply gesture. It mirrors the iOS
 * `MessageListView.dragGesture` + `BubbleSwipeResistance` book-keeping: a bubble
 * follows the finger toward its reply direction with a rubber-banded resistance
 * past a comfort zone, arms once the directed distance crosses the commit
 * threshold (firing a single haptic on that transition), and commits the reply
 * only if the finger is released while armed. Behaviour is asserted through the
 * public [SwipeToReply] surface.
 */
class SwipeToReplyTest {

    // ---- resolveOffset: direction gating -----------------------------------

    @Test
    fun incoming_bubble_dragged_the_wrong_way_never_moves() {
        // Incoming replies on a rightward (positive) drag; a leftward drag is inert.
        assertThat(SwipeToReply.resolveOffset(-40f, ReplyDirection.FromIncoming)).isEqualTo(0f)
    }

    @Test
    fun own_bubble_dragged_the_wrong_way_never_moves() {
        // Own replies on a leftward (negative) drag; a rightward drag is inert.
        assertThat(SwipeToReply.resolveOffset(40f, ReplyDirection.FromOwn)).isEqualTo(0f)
    }

    @Test
    fun zero_translation_yields_zero_offset() {
        assertThat(SwipeToReply.resolveOffset(0f, ReplyDirection.FromIncoming)).isEqualTo(0f)
    }

    // ---- resolveOffset: within the comfort zone is 1:1 ---------------------

    @Test
    fun within_the_zone_the_bubble_tracks_the_finger_one_to_one() {
        assertThat(SwipeToReply.resolveOffset(40f, ReplyDirection.FromIncoming)).isEqualTo(40f)
    }

    @Test
    fun own_bubble_within_the_zone_tracks_the_finger_and_keeps_its_sign() {
        assertThat(SwipeToReply.resolveOffset(-40f, ReplyDirection.FromOwn)).isEqualTo(-40f)
    }

    @Test
    fun exactly_at_the_zone_edge_is_still_one_to_one() {
        assertThat(SwipeToReply.resolveOffset(72f, ReplyDirection.FromIncoming))
            .isEqualTo(SwipeToReply.RUBBER_BAND_ZONE)
    }

    // ---- resolveOffset: past the zone rubber-bands -------------------------

    @Test
    fun past_the_zone_the_extra_distance_is_compressed() {
        // 100 = zone(72) + 28 over; over compresses by RUBBER_BAND_RESISTANCE (0.15).
        val expected = 72f + (100f - 72f) * SwipeToReply.RUBBER_BAND_RESISTANCE
        assertThat(SwipeToReply.resolveOffset(100f, ReplyDirection.FromIncoming)).isEqualTo(expected)
    }

    @Test
    fun rubber_banded_offset_is_always_less_than_the_raw_translation() {
        val raw = 300f
        val offset = SwipeToReply.resolveOffset(raw, ReplyDirection.FromIncoming)
        assertThat(offset).isLessThan(raw)
        assertThat(offset).isGreaterThan(SwipeToReply.RUBBER_BAND_ZONE)
    }

    @Test
    fun own_bubble_past_the_zone_compresses_and_stays_negative() {
        val offset = SwipeToReply.resolveOffset(-200f, ReplyDirection.FromOwn)
        val expectedMagnitude = 72f + (200f - 72f) * SwipeToReply.RUBBER_BAND_RESISTANCE
        assertThat(offset).isEqualTo(-expectedMagnitude)
    }

    // ---- isArmed: commit threshold -----------------------------------------

    @Test
    fun below_the_commit_threshold_is_not_armed() {
        assertThat(SwipeToReply.isArmed(65f, ReplyDirection.FromIncoming)).isFalse()
    }

    @Test
    fun exactly_at_the_commit_threshold_is_armed() {
        assertThat(SwipeToReply.isArmed(SwipeToReply.COMMIT_THRESHOLD, ReplyDirection.FromIncoming))
            .isTrue()
    }

    @Test
    fun past_the_commit_threshold_is_armed() {
        assertThat(SwipeToReply.isArmed(80f, ReplyDirection.FromIncoming)).isTrue()
    }

    @Test
    fun own_bubble_armed_on_a_negative_offset() {
        assertThat(SwipeToReply.isArmed(-70f, ReplyDirection.FromOwn)).isTrue()
    }

    @Test
    fun an_offset_in_the_wrong_direction_is_never_armed() {
        assertThat(SwipeToReply.isArmed(70f, ReplyDirection.FromOwn)).isFalse()
    }

    // ---- onDrag: reducer + one-shot haptic ---------------------------------

    @Test
    fun crossing_the_threshold_arms_and_fires_the_haptic_once() {
        val drag = SwipeToReply.onDrag(SwipeReplyState(), 80f, ReplyDirection.FromIncoming)
        assertThat(drag.state.isArmed).isTrue()
        assertThat(drag.armedHaptic).isTrue()
    }

    @Test
    fun staying_armed_does_not_re_fire_the_haptic() {
        val first = SwipeToReply.onDrag(SwipeReplyState(), 80f, ReplyDirection.FromIncoming)
        val second = SwipeToReply.onDrag(first.state, 120f, ReplyDirection.FromIncoming)
        assertThat(second.state.isArmed).isTrue()
        assertThat(second.armedHaptic).isFalse()
    }

    @Test
    fun dropping_back_below_the_threshold_disarms_without_a_haptic() {
        val armed = SwipeToReply.onDrag(SwipeReplyState(), 80f, ReplyDirection.FromIncoming)
        val relaxed = SwipeToReply.onDrag(armed.state, 30f, ReplyDirection.FromIncoming)
        assertThat(relaxed.state.isArmed).isFalse()
        assertThat(relaxed.armedHaptic).isFalse()
        assertThat(relaxed.state.offset).isEqualTo(30f)
    }

    @Test
    fun re_arming_after_disarming_fires_the_haptic_again() {
        val armed = SwipeToReply.onDrag(SwipeReplyState(), 80f, ReplyDirection.FromIncoming)
        val relaxed = SwipeToReply.onDrag(armed.state, 30f, ReplyDirection.FromIncoming)
        val reArmed = SwipeToReply.onDrag(relaxed.state, 90f, ReplyDirection.FromIncoming)
        assertThat(reArmed.armedHaptic).isTrue()
    }

    @Test
    fun a_short_drag_never_arms_and_never_fires_a_haptic() {
        val drag = SwipeToReply.onDrag(SwipeReplyState(), 20f, ReplyDirection.FromIncoming)
        assertThat(drag.state.isArmed).isFalse()
        assertThat(drag.armedHaptic).isFalse()
    }

    // ---- onRelease: commit vs cancel ---------------------------------------

    @Test
    fun releasing_while_armed_commits_the_reply() {
        val armed = SwipeToReply.onDrag(SwipeReplyState(), 90f, ReplyDirection.FromIncoming).state
        assertThat(SwipeToReply.onRelease(armed, ReplyDirection.FromIncoming))
            .isEqualTo(SwipeReplyRelease.Commit)
    }

    @Test
    fun releasing_short_of_the_threshold_cancels() {
        val short = SwipeToReply.onDrag(SwipeReplyState(), 40f, ReplyDirection.FromIncoming).state
        assertThat(SwipeToReply.onRelease(short, ReplyDirection.FromIncoming))
            .isEqualTo(SwipeReplyRelease.Cancel)
    }

    @Test
    fun releasing_an_untouched_bubble_cancels() {
        assertThat(SwipeToReply.onRelease(SwipeReplyState(), ReplyDirection.FromIncoming))
            .isEqualTo(SwipeReplyRelease.Cancel)
    }

    @Test
    fun own_bubble_released_while_armed_commits() {
        val armed = SwipeToReply.onDrag(SwipeReplyState(), -90f, ReplyDirection.FromOwn).state
        assertThat(SwipeToReply.onRelease(armed, ReplyDirection.FromOwn))
            .isEqualTo(SwipeReplyRelease.Commit)
    }
}
