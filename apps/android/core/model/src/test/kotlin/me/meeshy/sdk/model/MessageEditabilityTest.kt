package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MessageEditabilityTest {

    private val window = MessageEditability.EDIT_WINDOW_MILLIS
    private val created = 1_000_000_000_000L

    @Test
    fun the_edit_window_is_twenty_four_hours_like_the_shared_law() {
        assertThat(window).isEqualTo(24L * 60 * 60 * 1000)
        assertThat(window).isEqualTo(MessageActionPolicy.EDIT_WINDOW_MILLIS)
    }

    @Test
    fun an_own_message_created_moments_ago_is_editable() {
        assertThat(MessageEditability.canEdit(isOwn = true, createdAtMillis = created, nowMillis = created + 1)).isTrue()
    }

    @Test
    fun an_own_message_just_inside_the_window_is_editable() {
        assertThat(MessageEditability.canEdit(isOwn = true, createdAtMillis = created, nowMillis = created + window - 1)).isTrue()
    }

    @Test
    fun an_own_message_exactly_at_the_window_boundary_is_still_editable_bounds_included() {
        assertThat(MessageEditability.canEdit(isOwn = true, createdAtMillis = created, nowMillis = created + window)).isTrue()
    }

    @Test
    fun an_own_message_one_millisecond_past_the_window_is_no_longer_editable() {
        assertThat(MessageEditability.canEdit(isOwn = true, createdAtMillis = created, nowMillis = created + window + 1)).isFalse()
    }

    @Test
    fun an_own_message_past_the_window_is_not_editable() {
        assertThat(
            MessageEditability.canEdit(isOwn = true, createdAtMillis = created, nowMillis = created + window + 60_000),
        ).isFalse()
    }

    @Test
    fun a_platform_moderator_edits_past_the_window_and_on_someone_else_message() {
        assertThat(
            MessageEditability.canEdit(
                isOwn = true,
                createdAtMillis = created,
                nowMillis = created + window + 60_000,
                moderatesPlatform = true,
            ),
        ).isTrue()
        assertThat(
            MessageEditability.canEdit(isOwn = false, createdAtMillis = created, nowMillis = created + 1, moderatesPlatform = true),
        ).isTrue()
    }

    @Test
    fun a_message_from_someone_else_is_never_editable_without_the_platform_rank() {
        assertThat(MessageEditability.canEdit(isOwn = false, createdAtMillis = created, nowMillis = created + 1)).isFalse()
    }

    @Test
    fun an_own_message_with_a_future_creation_time_is_treated_as_just_created() {
        assertThat(MessageEditability.canEdit(isOwn = true, createdAtMillis = created + 5_000, nowMillis = created)).isTrue()
    }

    @Test
    fun an_own_message_with_an_unknown_creation_time_stays_editable_since_the_window_cannot_be_proven() {
        assertThat(MessageEditability.canEdit(isOwn = true, createdAtMillis = null, nowMillis = created)).isTrue()
        assertThat(MessageEditability.windowEndsAtMillis(null)).isNull()
    }

    @Test
    fun a_message_with_an_unknown_creation_time_from_someone_else_is_still_not_editable() {
        assertThat(MessageEditability.canEdit(isOwn = false, createdAtMillis = null, nowMillis = created)).isFalse()
    }

    @Test
    fun the_window_ends_twenty_four_hours_after_creation() {
        assertThat(MessageEditability.windowEndsAtMillis(created)).isEqualTo(created + window)
    }

    @Test
    fun a_caller_can_override_the_window_length() {
        assertThat(
            MessageEditability.canEdit(isOwn = true, createdAtMillis = created, nowMillis = created + 5_000, windowMillis = 1_000),
        ).isFalse()
    }
}
