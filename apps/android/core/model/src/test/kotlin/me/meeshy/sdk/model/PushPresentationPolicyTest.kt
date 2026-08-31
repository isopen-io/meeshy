package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import java.time.LocalDateTime
import org.junit.Test

/**
 * Behavioural spec for [PushPresentationPolicy] — the foreground-push banner gate (feature-parity
 * §M), the Android counterpart of iOS `NotificationPresentationResolver.options`. Covers the
 * on-screen-thread suppression, the socket-alive dedup, the socket-down preference gate
 * (push master / quiet hours / per-type toggle) and the sound option on the raised banner.
 */
class PushPresentationPolicyTest {

    // Noon, well outside the default 22:00→08:00 quiet-hours window.
    private val awake = LocalDateTime.of(2026, 8, 17, 12, 0)

    // Inside the default quiet-hours window.
    private val quiet = LocalDateTime.of(2026, 8, 17, 23, 0)

    private fun decide(
        socketConnected: Boolean = false,
        preferences: UserNotificationPreferences = UserNotificationPreferences(),
        rawType: String? = "new_message",
        conversationId: String? = "c1",
        activeConversationId: String? = null,
        now: LocalDateTime = awake,
    ) = PushPresentationPolicy.decide(
        socketConnected = socketConnected,
        preferences = preferences,
        rawType = rawType,
        conversationId = conversationId,
        activeConversationId = activeConversationId,
        now = now,
    )

    @Test
    fun `a socket-down push of an enabled type outside quiet hours raises a sounded banner`() {
        assertThat(decide()).isEqualTo(PushPresentationDecision.Alert(playSound = true))
    }

    @Test
    fun `a push for the conversation on screen is suppressed`() {
        // Everything else would raise a banner (socket down, type enabled, awake) — the
        // on-screen guard still wins, so a reader is never buzzed for the thread they see.
        assertThat(decide(conversationId = "c1", activeConversationId = "c1"))
            .isEqualTo(PushPresentationDecision.Suppress)
    }

    @Test
    fun `a push for a different conversation than the one on screen is not suppressed by that guard`() {
        assertThat(decide(conversationId = "c2", activeConversationId = "c1"))
            .isEqualTo(PushPresentationDecision.Alert(playSound = true))
    }

    @Test
    fun `the on-screen guard needs a conversation id — a push without one still evaluates the gate`() {
        // A null conversationId can never equal the active id, so the guard is skipped and the
        // push is decided on its own merits (here: socket down, enabled, awake ⇒ alert).
        assertThat(decide(conversationId = null, activeConversationId = "c1"))
            .isEqualTo(PushPresentationDecision.Alert(playSound = true))
    }

    @Test
    fun `a live socket suppresses the banner — the in-app toast already surfaces it`() {
        assertThat(decide(socketConnected = true))
            .isEqualTo(PushPresentationDecision.Suppress)
    }

    @Test
    fun `the push master off suppresses the banner when the socket is down`() {
        assertThat(decide(preferences = UserNotificationPreferences(pushEnabled = false)))
            .isEqualTo(PushPresentationDecision.Suppress)
    }

    @Test
    fun `a push inside the quiet-hours window is suppressed`() {
        assertThat(decide(preferences = UserNotificationPreferences(dndEnabled = true), now = quiet))
            .isEqualTo(PushPresentationDecision.Suppress)
    }

    @Test
    fun `quiet hours do not suppress a push received while awake`() {
        assertThat(decide(preferences = UserNotificationPreferences(dndEnabled = true), now = awake))
            .isEqualTo(PushPresentationDecision.Alert(playSound = true))
    }

    @Test
    fun `a muted per-type toggle suppresses that type`() {
        assertThat(
            decide(
                rawType = "message_reaction",
                preferences = UserNotificationPreferences(reactionEnabled = false),
            ),
        ).isEqualTo(PushPresentationDecision.Suppress)
    }

    @Test
    fun `muting one type leaves another type's push alone`() {
        assertThat(
            decide(
                rawType = "new_message",
                preferences = UserNotificationPreferences(reactionEnabled = false),
            ),
        ).isEqualTo(PushPresentationDecision.Alert(playSound = true))
    }

    @Test
    fun `an unknown type is gated by the system toggle — off suppresses`() {
        assertThat(
            decide(
                rawType = "brand_new_wire_type",
                preferences = UserNotificationPreferences(systemEnabled = false),
            ),
        ).isEqualTo(PushPresentationDecision.Suppress)
    }

    @Test
    fun `an unknown type passes when the system toggle is on`() {
        assertThat(decide(rawType = "brand_new_wire_type"))
            .isEqualTo(PushPresentationDecision.Alert(playSound = true))
    }

    @Test
    fun `an absent type is treated as system — off suppresses`() {
        assertThat(
            decide(rawType = null, preferences = UserNotificationPreferences(systemEnabled = false)),
        ).isEqualTo(PushPresentationDecision.Suppress)
    }

    @Test
    fun `a raised banner stays silent when sound is disabled`() {
        assertThat(decide(preferences = UserNotificationPreferences(soundEnabled = false)))
            .isEqualTo(PushPresentationDecision.Alert(playSound = false))
    }

    @Test
    fun `the socket-alive dedup outranks the preference gate`() {
        // Socket up AND push disabled: the socket branch is reached first, so the outcome is the
        // dedup Suppress, not the preference Suppress — proving branch order, not just the verdict.
        assertThat(
            decide(socketConnected = true, preferences = UserNotificationPreferences(pushEnabled = false)),
        ).isEqualTo(PushPresentationDecision.Suppress)
    }
}
