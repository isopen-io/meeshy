package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MessageDeletabilityTest {

    private val window = MessageDeletability.DELETE_FOR_EVERYONE_WINDOW_MILLIS
    private val created = 1_000_000_000_000L

    @Test
    fun the_delete_for_everyone_window_is_two_hours() {
        assertThat(window).isEqualTo(2L * 60 * 60 * 1000)
    }

    @Test
    fun an_own_message_created_moments_ago_can_be_deleted_for_everyone() {
        assertThat(
            MessageDeletability.canDeleteForEveryone(
                isOwn = true,
                createdAtMillis = created,
                nowMillis = created + 1,
            ),
        ).isTrue()
    }

    @Test
    fun an_own_message_exactly_at_the_window_boundary_can_still_be_deleted_for_everyone() {
        // iOS gates delete-for-everyone with `<=` (inclusive), unlike the `<`
        // exclusive edit window, so the boundary instant is still deletable.
        assertThat(
            MessageDeletability.canDeleteForEveryone(
                isOwn = true,
                createdAtMillis = created,
                nowMillis = created + window,
            ),
        ).isTrue()
    }

    @Test
    fun an_own_message_one_millisecond_past_the_window_can_no_longer_be_deleted_for_everyone() {
        assertThat(
            MessageDeletability.canDeleteForEveryone(
                isOwn = true,
                createdAtMillis = created,
                nowMillis = created + window + 1,
            ),
        ).isFalse()
    }

    @Test
    fun an_own_message_well_past_the_window_cannot_be_deleted_for_everyone() {
        assertThat(
            MessageDeletability.canDeleteForEveryone(
                isOwn = true,
                createdAtMillis = created,
                nowMillis = created + window + 60_000,
            ),
        ).isFalse()
    }

    @Test
    fun a_message_from_someone_else_can_never_be_deleted_for_everyone_even_within_the_window() {
        assertThat(
            MessageDeletability.canDeleteForEveryone(
                isOwn = false,
                createdAtMillis = created,
                nowMillis = created + 1,
            ),
        ).isFalse()
    }

    @Test
    fun an_own_message_with_a_future_creation_time_is_treated_as_just_created() {
        assertThat(
            MessageDeletability.canDeleteForEveryone(
                isOwn = true,
                createdAtMillis = created + 5_000,
                nowMillis = created,
            ),
        ).isTrue()
    }

    @Test
    fun an_own_message_with_an_unknown_creation_time_stays_deletable_for_everyone_since_the_window_cannot_be_proven() {
        assertThat(
            MessageDeletability.canDeleteForEveryone(
                isOwn = true,
                createdAtMillis = null,
                nowMillis = created,
            ),
        ).isTrue()
    }

    @Test
    fun a_message_with_an_unknown_creation_time_from_someone_else_still_cannot_be_deleted_for_everyone() {
        assertThat(
            MessageDeletability.canDeleteForEveryone(
                isOwn = false,
                createdAtMillis = null,
                nowMillis = created,
            ),
        ).isFalse()
    }

    @Test
    fun a_caller_can_override_the_window_length() {
        assertThat(
            MessageDeletability.canDeleteForEveryone(
                isOwn = true,
                createdAtMillis = created,
                nowMillis = created + 5_000,
                windowMillis = 1_000,
            ),
        ).isFalse()
    }
}
