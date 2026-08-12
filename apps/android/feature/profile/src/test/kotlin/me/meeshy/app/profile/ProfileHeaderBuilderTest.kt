package me.meeshy.app.profile

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.PresenceState
import org.junit.Test

class ProfileHeaderBuilderTest {

    private val now = 1_700_000_000_000L

    private fun user(
        username: String = "alice",
        firstName: String? = null,
        lastName: String? = null,
        displayName: String? = null,
        bio: String? = null,
        avatar: String? = null,
        isOnline: Boolean? = null,
        lastActiveAt: String? = null,
        profileCompletionRate: Int? = null,
        signalIdentityKeyPublic: String? = null,
        createdAt: String? = null,
        systemLanguage: String? = null,
        regionalLanguage: String? = null,
        registrationCountry: String? = null,
        timezone: String? = null,
    ) = MeeshyUser(
        id = "u1",
        username = username,
        firstName = firstName,
        lastName = lastName,
        displayName = displayName,
        bio = bio,
        avatar = avatar,
        isOnline = isOnline,
        lastActiveAt = lastActiveAt,
        profileCompletionRate = profileCompletionRate,
        signalIdentityKeyPublic = signalIdentityKeyPublic,
        createdAt = createdAt,
        systemLanguage = systemLanguage,
        regionalLanguage = regionalLanguage,
        registrationCountry = registrationCountry,
        timezone = timezone,
    )

    // ---- display name ladder --------------------------------------------

    @Test
    fun `explicit display name wins over names and username`() {
        val header = ProfileHeaderBuilder.build(
            user(displayName = "Alice A.", firstName = "Alice", lastName = "Anderson"), now,
        )
        assertThat(header.displayName).isEqualTo("Alice A.")
    }

    @Test
    fun `blank display name falls through to first plus last name`() {
        val header = ProfileHeaderBuilder.build(
            user(displayName = "   ", firstName = "Alice", lastName = "Anderson"), now,
        )
        assertThat(header.displayName).isEqualTo("Alice Anderson")
    }

    @Test
    fun `falls back to username when no names present`() {
        val header = ProfileHeaderBuilder.build(user(username = "alice"), now)
        assertThat(header.displayName).isEqualTo("alice")
    }

    // ---- handle ----------------------------------------------------------

    @Test
    fun `handle is the at-prefixed username`() {
        assertThat(ProfileHeaderBuilder.build(user(username = "bob"), now).handle).isEqualTo("@bob")
    }

    @Test
    fun `handle is null when username is blank`() {
        assertThat(ProfileHeaderBuilder.build(user(username = "  "), now).handle).isNull()
    }

    // ---- optional text fields degrade blank to null ----------------------

    @Test
    fun `blank optional fields become null`() {
        val header = ProfileHeaderBuilder.build(
            user(
                bio = "  ", avatar = "", systemLanguage = " ", regionalLanguage = "",
                registrationCountry = " ", timezone = "  ",
            ),
            now,
        )
        assertThat(header.bio).isNull()
        assertThat(header.avatarUrl).isNull()
        assertThat(header.systemLanguage).isNull()
        assertThat(header.regionalLanguage).isNull()
        assertThat(header.country).isNull()
        assertThat(header.timezone).isNull()
    }

    @Test
    fun `present optional fields pass through`() {
        val header = ProfileHeaderBuilder.build(
            user(
                bio = "hi there",
                avatar = "https://cdn/a.png",
                systemLanguage = "fr",
                regionalLanguage = "en",
                registrationCountry = "FR",
                timezone = "Europe/Paris",
            ),
            now,
        )
        assertThat(header.bio).isEqualTo("hi there")
        assertThat(header.avatarUrl).isEqualTo("https://cdn/a.png")
        assertThat(header.systemLanguage).isEqualTo("fr")
        assertThat(header.regionalLanguage).isEqualTo("en")
        assertThat(header.country).isEqualTo("FR")
        assertThat(header.timezone).isEqualTo("Europe/Paris")
    }

    // ---- presence --------------------------------------------------------

    @Test
    fun `presence is offline when isOnline is null`() {
        assertThat(ProfileHeaderBuilder.build(user(isOnline = null), now).presence)
            .isEqualTo(PresenceState.OFFLINE)
    }

    @Test
    fun `presence is offline when isOnline is false`() {
        assertThat(ProfileHeaderBuilder.build(user(isOnline = false), now).presence)
            .isEqualTo(PresenceState.OFFLINE)
    }

    @Test
    fun `presence is online when online with no reliable timestamp`() {
        assertThat(ProfileHeaderBuilder.build(user(isOnline = true, lastActiveAt = null), now).presence)
            .isEqualTo(PresenceState.ONLINE)
    }

    @Test
    fun `presence is online when last active within the idle window`() {
        val recent = java.time.Instant.ofEpochMilli(now - 60_000L).toString()
        assertThat(ProfileHeaderBuilder.build(user(isOnline = true, lastActiveAt = recent), now).presence)
            .isEqualTo(PresenceState.ONLINE)
    }

    @Test
    fun `presence is away when disconnected and idle two minutes`() {
        // Canonical 1/3/5 rule (SSOT: packages/shared/utils/user-presence.ts,
        // mirrored in Presence.kt UserPresence.state + iOS UserPresence.state):
        // a disconnected user whose frozen lastActiveAt sits in the 60s..3min
        // window resolves to AWAY (orange). isOnline=false here — a connected
        // user would stay ONLINE up to the 5min anti-stale guard.
        val awayAgo = java.time.Instant.ofEpochMilli(now - 120_000L).toString()
        assertThat(ProfileHeaderBuilder.build(user(isOnline = false, lastActiveAt = awayAgo), now).presence)
            .isEqualTo(PresenceState.AWAY)
    }

    @Test
    fun `presence is idle when disconnected and idle four minutes`() {
        // 3min..5min -> IDLE (grey, still displayed) per the 1/3/5 rule.
        val idleAgo = java.time.Instant.ofEpochMilli(now - 240_000L).toString()
        assertThat(ProfileHeaderBuilder.build(user(isOnline = false, lastActiveAt = idleAgo), now).presence)
            .isEqualTo(PresenceState.IDLE)
    }

    @Test
    fun `presence is offline when disconnected past the five minute window`() {
        // > 5min -> OFFLINE (no dot). A 10min-old frozen timestamp is offline,
        // not away — there is no 30min window; the offline boundary is 5min.
        val offlineAgo = java.time.Instant.ofEpochMilli(now - 600_000L).toString()
        assertThat(ProfileHeaderBuilder.build(user(isOnline = false, lastActiveAt = offlineAgo), now).presence)
            .isEqualTo(PresenceState.OFFLINE)
    }

    // ---- last seen -------------------------------------------------------

    @Test
    fun `last seen is null for an online user (the live dot speaks, not a stale line)`() {
        val recent = java.time.Instant.ofEpochMilli(now - 60_000L).toString()
        assertThat(ProfileHeaderBuilder.build(user(isOnline = true, lastActiveAt = recent), now).lastSeenEpochMillis)
            .isNull()
    }

    @Test
    fun `last seen carries the parsed instant for an away user`() {
        val awayAgo = java.time.Instant.ofEpochMilli(now - 120_000L).toString()
        val header = ProfileHeaderBuilder.build(user(isOnline = false, lastActiveAt = awayAgo), now)
        assertThat(header.presence).isEqualTo(PresenceState.AWAY)
        assertThat(header.lastSeenEpochMillis).isEqualTo(now - 120_000L)
    }

    @Test
    fun `last seen carries the parsed instant for an idle user`() {
        val idleAgo = java.time.Instant.ofEpochMilli(now - 240_000L).toString()
        val header = ProfileHeaderBuilder.build(user(isOnline = false, lastActiveAt = idleAgo), now)
        assertThat(header.presence).isEqualTo(PresenceState.IDLE)
        assertThat(header.lastSeenEpochMillis).isEqualTo(now - 240_000L)
    }

    @Test
    fun `last seen carries the parsed instant for an offline user`() {
        val old = java.time.Instant.ofEpochMilli(now - 3 * 86_400_000L).toString()
        val header = ProfileHeaderBuilder.build(user(isOnline = false, lastActiveAt = old), now)
        assertThat(header.presence).isEqualTo(PresenceState.OFFLINE)
        assertThat(header.lastSeenEpochMillis).isEqualTo(now - 3 * 86_400_000L)
    }

    @Test
    fun `last seen is null when lastActiveAt is absent`() {
        assertThat(ProfileHeaderBuilder.build(user(isOnline = false, lastActiveAt = null), now).lastSeenEpochMillis)
            .isNull()
    }

    @Test
    fun `last seen is null when lastActiveAt is unparseable`() {
        assertThat(ProfileHeaderBuilder.build(user(isOnline = false, lastActiveAt = "not-a-date"), now).lastSeenEpochMillis)
            .isNull()
    }

    // ---- completion ring -------------------------------------------------

    @Test
    fun `completion percent is null when the server omits it`() {
        assertThat(ProfileHeaderBuilder.build(user(profileCompletionRate = null), now).completionPercent)
            .isNull()
    }

    @Test
    fun `completion percent passes an in-range value through`() {
        assertThat(ProfileHeaderBuilder.build(user(profileCompletionRate = 42), now).completionPercent)
            .isEqualTo(42)
    }

    @Test
    fun `completion percent clamps a negative value to zero`() {
        assertThat(ProfileHeaderBuilder.build(user(profileCompletionRate = -5), now).completionPercent)
            .isEqualTo(0)
    }

    @Test
    fun `completion percent clamps an over-full value to one hundred`() {
        assertThat(ProfileHeaderBuilder.build(user(profileCompletionRate = 150), now).completionPercent)
            .isEqualTo(100)
    }

    // ---- E2EE badge ------------------------------------------------------

    @Test
    fun `e2ee is false when no identity key is published`() {
        assertThat(ProfileHeaderBuilder.build(user(signalIdentityKeyPublic = null), now).hasE2EE).isFalse()
    }

    @Test
    fun `e2ee is false when the identity key is blank`() {
        assertThat(ProfileHeaderBuilder.build(user(signalIdentityKeyPublic = "  "), now).hasE2EE).isFalse()
    }

    @Test
    fun `e2ee is true when an identity key is published`() {
        assertThat(ProfileHeaderBuilder.build(user(signalIdentityKeyPublic = "BASE64KEY=="), now).hasE2EE)
            .isTrue()
    }

    // ---- member since ----------------------------------------------------

    @Test
    fun `member since parses a valid iso timestamp to epoch millis`() {
        val header = ProfileHeaderBuilder.build(user(createdAt = "2023-01-01T00:00:00Z"), now)
        assertThat(header.memberSinceEpochMillis).isEqualTo(1_672_531_200_000L)
    }

    @Test
    fun `member since is null when createdAt is absent`() {
        assertThat(ProfileHeaderBuilder.build(user(createdAt = null), now).memberSinceEpochMillis).isNull()
    }

    @Test
    fun `member since is null when createdAt is unparseable`() {
        assertThat(ProfileHeaderBuilder.build(user(createdAt = "not-a-date"), now).memberSinceEpochMillis)
            .isNull()
    }
}
