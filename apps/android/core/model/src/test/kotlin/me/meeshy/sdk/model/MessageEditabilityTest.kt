package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MessageEditabilityTest {

    private val window = MessageEditability.EDIT_WINDOW_MILLIS
    private val created = 1_000_000_000_000L

    @Test
    fun the_edit_window_is_two_hours() {
        assertThat(window).isEqualTo(2L * 60 * 60 * 1000)
    }

    @Test
    fun an_own_message_created_moments_ago_is_editable() {
        assertThat(
            MessageEditability.canEdit(
                isOwn = true,
                createdAtMillis = created,
                nowMillis = created + 1,
            ),
        ).isTrue()
    }

    @Test
    fun an_own_message_just_inside_the_window_is_editable() {
        assertThat(
            MessageEditability.canEdit(
                isOwn = true,
                createdAtMillis = created,
                nowMillis = created + window - 1,
            ),
        ).isTrue()
    }

    @Test
    fun an_own_message_exactly_at_the_window_boundary_is_no_longer_editable() {
        assertThat(
            MessageEditability.canEdit(
                isOwn = true,
                createdAtMillis = created,
                nowMillis = created + window,
            ),
        ).isFalse()
    }

    @Test
    fun an_own_message_past_the_window_is_not_editable() {
        assertThat(
            MessageEditability.canEdit(
                isOwn = true,
                createdAtMillis = created,
                nowMillis = created + window + 60_000,
            ),
        ).isFalse()
    }

    @Test
    fun a_message_from_someone_else_is_never_editable_even_within_the_window() {
        assertThat(
            MessageEditability.canEdit(
                isOwn = false,
                createdAtMillis = created,
                nowMillis = created + 1,
            ),
        ).isFalse()
    }

    @Test
    fun an_own_message_with_a_future_creation_time_is_treated_as_just_created() {
        assertThat(
            MessageEditability.canEdit(
                isOwn = true,
                createdAtMillis = created + 5_000,
                nowMillis = created,
            ),
        ).isTrue()
    }

    @Test
    fun an_own_message_with_an_unknown_creation_time_stays_editable_since_the_window_cannot_be_proven() {
        assertThat(
            MessageEditability.canEdit(
                isOwn = true,
                createdAtMillis = null,
                nowMillis = created,
            ),
        ).isTrue()
    }

    @Test
    fun a_message_with_an_unknown_creation_time_from_someone_else_is_still_not_editable() {
        assertThat(
            MessageEditability.canEdit(
                isOwn = false,
                createdAtMillis = null,
                nowMillis = created,
            ),
        ).isFalse()
    }

    @Test
    fun a_caller_can_override_the_window_length() {
        assertThat(
            MessageEditability.canEdit(
                isOwn = true,
                createdAtMillis = created,
                nowMillis = created + 5_000,
                windowMillis = 1_000,
            ),
        ).isFalse()
    }
}
