package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MessageDeletabilityTest {

    private val created = 1_000_000_000_000L
    private val aYear = 365L * 24 * 60 * 60 * 1000

    @Test
    fun an_own_message_created_moments_ago_can_be_deleted_for_everyone() {
        assertThat(MessageDeletability.canDeleteForEveryone(isOwn = true, createdAtMillis = created, nowMillis = created + 1)).isTrue()
    }

    @Test
    fun the_author_deletes_for_everyone_without_any_window_like_the_gateway() {
        assertThat(
            MessageDeletability.canDeleteForEveryone(isOwn = true, createdAtMillis = created, nowMillis = created + aYear),
        ).isTrue()
    }

    @Test
    fun a_message_from_someone_else_can_never_be_deleted_for_everyone() {
        assertThat(MessageDeletability.canDeleteForEveryone(isOwn = false, createdAtMillis = created, nowMillis = created + 1)).isFalse()
        assertThat(MessageDeletability.canDeleteForEveryone(isOwn = false, createdAtMillis = null, nowMillis = created)).isFalse()
    }

    @Test
    fun an_own_message_with_a_future_creation_time_is_treated_as_just_created() {
        assertThat(
            MessageDeletability.canDeleteForEveryone(isOwn = true, createdAtMillis = created + 5_000, nowMillis = created, windowMillis = 1_000),
        ).isTrue()
    }

    @Test
    fun an_own_message_with_an_unknown_creation_time_stays_deletable_for_everyone() {
        assertThat(
            MessageDeletability.canDeleteForEveryone(isOwn = true, createdAtMillis = null, nowMillis = created, windowMillis = 1_000),
        ).isTrue()
    }

    @Test
    fun a_caller_window_is_inclusive_at_its_boundary() {
        assertThat(
            MessageDeletability.canDeleteForEveryone(isOwn = true, createdAtMillis = created, nowMillis = created + 1_000, windowMillis = 1_000),
        ).isTrue()
        assertThat(
            MessageDeletability.canDeleteForEveryone(isOwn = true, createdAtMillis = created, nowMillis = created + 1_001, windowMillis = 1_000),
        ).isFalse()
    }

    @Test
    fun a_caller_can_override_the_window_length() {
        assertThat(
            MessageDeletability.canDeleteForEveryone(isOwn = true, createdAtMillis = created, nowMillis = created + 5_000, windowMillis = 1_000),
        ).isFalse()
    }
}
