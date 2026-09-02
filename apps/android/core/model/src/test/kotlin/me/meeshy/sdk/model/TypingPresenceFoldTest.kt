package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Locks the root product rule « typing:start reçu = preuve d'activité » on the Android side:
 * a `typing:start` frame forces its sender online in the presence map, stamped at the caller's
 * reference clock, and decay afterward is left entirely to [UserPresence.state] reading the same
 * two fields — exercised here by chaining [TypingPresenceFold.forcedEntry] straight into it.
 */
class TypingPresenceFoldTest {

    private val now = 1_700_000_000_000L

    private fun typing(userId: String = "u1", username: String? = "alice", displayName: String? = "Alice") =
        TypingEvent(conversationId = "c1", userId = userId, username = username, displayName = displayName)

    // MARK: - forcedEntry

    @Test
    fun `forces the typer online at the reference clock`() {
        val entry = TypingPresenceFold.forcedEntry(typing = typing(), nowMillis = now)

        assertThat(entry.userId).isEqualTo("u1")
        assertThat(entry.isOnline).isTrue()
        assertThat(entry.lastActiveAt).isEqualTo(java.time.Instant.ofEpochMilli(now).toString())
    }

    @Test
    fun `prefers the display name over the username when both are present`() {
        val entry = TypingPresenceFold.forcedEntry(typing(username = "alice", displayName = "Alice"), now)
        assertThat(entry.username).isEqualTo("Alice")
    }

    @Test
    fun `falls back to the username when no display name is on the wire`() {
        val entry = TypingPresenceFold.forcedEntry(typing(username = "alice", displayName = null), now)
        assertThat(entry.username).isEqualTo("alice")
    }

    @Test
    fun `falls back to an empty username when the wire carries neither`() {
        val entry = TypingPresenceFold.forcedEntry(typing(username = null, displayName = null), now)
        assertThat(entry.username).isEqualTo("")
    }

    // MARK: - decay afterward is normal — no special-casing, [UserPresence.state] alone applies.
    // `forcedEntry` always writes `isOnline = true` (an active user, exactly like iOS
    // `PresenceManager.noteActivity` and web's `updateUserStatus(..., { isOnline: true, ... })`),
    // so [UserPresence.state]'s anti-stale guard — not the away/idle staircase — governs the
    // decay: ONLINE holds through the 60s/180s marks and only drops straight to OFFLINE past
    // the 5-minute guard, same as an already-connected user's entry would (see `PresenceTest`
    // "anti-stale guard").

    @Test
    fun `the forced entry reads online at the instant it is forced`() {
        val entry = TypingPresenceFold.forcedEntry(typing(), now)
        val state = UserPresence(isOnline = entry.isOnline, lastActiveAt = entry.lastActiveAt).state(now)
        assertThat(state).isEqualTo(PresenceState.ONLINE)
    }

    @Test
    fun `the forced entry stays online past the online window, guarded by the isOnline flag`() {
        val entry = TypingPresenceFold.forcedEntry(typing(), now)
        val later = now + UserPresence.ONLINE_WINDOW_MS + 1
        val state = UserPresence(isOnline = entry.isOnline, lastActiveAt = entry.lastActiveAt).state(later)
        assertThat(state).isEqualTo(PresenceState.ONLINE)
    }

    @Test
    fun `the forced entry stays online past the away window, guarded by the isOnline flag`() {
        val entry = TypingPresenceFold.forcedEntry(typing(), now)
        val later = now + UserPresence.AWAY_WINDOW_MS + 1
        val state = UserPresence(isOnline = entry.isOnline, lastActiveAt = entry.lastActiveAt).state(later)
        assertThat(state).isEqualTo(PresenceState.ONLINE)
    }

    @Test
    fun `the forced entry drops straight to offline (no dot) past the anti-stale guard`() {
        val entry = TypingPresenceFold.forcedEntry(typing(), now)
        val later = now + UserPresence.IDLE_WINDOW_MS + 1
        val state = UserPresence(isOnline = entry.isOnline, lastActiveAt = entry.lastActiveAt).state(later)
        assertThat(state).isEqualTo(PresenceState.OFFLINE)
    }
}
