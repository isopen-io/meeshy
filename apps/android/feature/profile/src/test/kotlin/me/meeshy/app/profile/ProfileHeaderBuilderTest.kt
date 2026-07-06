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
    fun `presence is away when online but idle past the window`() {
        val stale = java.time.Instant.ofEpochMilli(now - 600_000L).toString()
        assertThat(ProfileHeaderBuilder.build(user(isOnline = true, lastActiveAt = stale), now).presence)
            .isEqualTo(PresenceState.AWAY)
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
