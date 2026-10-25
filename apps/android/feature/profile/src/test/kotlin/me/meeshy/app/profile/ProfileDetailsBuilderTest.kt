package me.meeshy.app.profile

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.UserStats
import org.junit.Test
import java.util.Locale

class ProfileDetailsBuilderTest {

    private fun header(
        bio: String? = null,
        completionPercent: Int? = null,
        hasE2EE: Boolean = false,
        memberSinceEpochMillis: Long? = null,
        systemLanguage: String? = null,
        regionalLanguage: String? = null,
        country: String? = null,
        timezone: String? = null,
        voiceSample: ProfileVoiceSample? = null,
    ) = ProfileHeaderPresentation(
        displayName = "Alice",
        handle = "@alice",
        bio = bio,
        avatarUrl = null,
        presence = PresenceState.OFFLINE,
        completionPercent = completionPercent,
        hasE2EE = hasE2EE,
        memberSinceEpochMillis = memberSinceEpochMillis,
        lastSeenEpochMillis = null,
        systemLanguage = systemLanguage,
        regionalLanguage = regionalLanguage,
        country = country,
        timezone = timezone,
        voiceSample = voiceSample,
    )

    private fun about(header: ProfileHeaderPresentation) = ProfileDetailsBuilder.about(header, Locale.ENGLISH)

    @Test
    fun `a profile with nothing to tell has no About section`() {
        assertThat(about(header())).isNull()
    }

    @Test
    fun `languages alone do not open the About section, as on iOS`() {
        assertThat(about(header(systemLanguage = "fr", regionalLanguage = "en"))).isNull()
    }

    @Test
    fun `a blank bio does not open the About section`() {
        assertThat(about(header(bio = "   "))).isNull()
    }

    @Test
    fun `a bio opens the About section and carries the languages along`() {
        val section = about(header(bio = "Hello", systemLanguage = "fr"))
        assertThat(section?.bio).isEqualTo("Hello")
        assertThat(section?.languages?.map { it.code }).containsExactly("fr")
    }

    @Test
    fun `a timezone chip opens the About section`() {
        assertThat(about(header(timezone = "Europe/Paris"))?.timezone).isEqualTo("Europe/Paris")
    }

    @Test
    fun `a country chip carries its flag and its name in the device language`() {
        val country = about(header(country = "fr"))?.country
        assertThat(country?.flag).isEqualTo("🇫🇷")
        assertThat(country?.name).isEqualTo("France")
        assertThat(ProfileDetailsBuilder.about(header(country = "DE"), Locale.FRENCH)?.country?.name)
            .isEqualTo("Allemagne")
    }

    @Test
    fun `a country value that is not an ISO code is shown as written, without a flag`() {
        val country = about(header(country = "Cameroun"))?.country
        assertThat(country?.flag).isEmpty()
        assertThat(country?.name).isEqualTo("Cameroun")
    }

    @Test
    fun `the E2EE badge alone opens the About section`() {
        val section = about(header(hasE2EE = true))
        assertThat(section).isNotNull()
        assertThat(section?.hasE2EE).isTrue()
    }

    @Test
    fun `a completion rate opens the About section and is bounded to 0 100`() {
        assertThat(about(header(completionPercent = 0))?.completionPercent).isEqualTo(0)
        assertThat(about(header(completionPercent = 150))?.completionPercent).isEqualTo(100)
        assertThat(about(header(completionPercent = -5))?.completionPercent).isEqualTo(0)
        assertThat(about(header(completionPercent = 42))?.completionPercent).isEqualTo(42)
    }

    @Test
    fun `system and regional languages are deduplicated`() {
        val pills = ProfileDetailsBuilder.languagePills("fr", "FR ")
        assertThat(pills.map { it.code }).containsExactly("fr")
    }

    @Test
    fun `language pills keep the system language first and show the native name`() {
        val pills = ProfileDetailsBuilder.languagePills("es", "fr")
        assertThat(pills.map { it.code }).containsExactly("es", "fr").inOrder()
        assertThat(pills.first().name).isEqualTo("Español")
        assertThat(pills.first().flag).isNotEmpty()
    }

    @Test
    fun `an unknown language code has no pill`() {
        assertThat(ProfileDetailsBuilder.languagePills("zz", null)).isEmpty()
    }

    @Test
    fun `the voice sample of the header flows into the details`() {
        val sample = ProfileVoiceSample(url = "https://cdn/voice.m4a", durationMs = 4200)
        val details = ProfileDetailsBuilder.build(header(voiceSample = sample), stats = null, isLoadingStats = false)
        assertThat(details.voice).isEqualTo(sample)
    }

    @Test
    fun `the stats band reads the profile document stats`() {
        val details = ProfileDetailsBuilder.build(
            header(memberSinceEpochMillis = 1_700_000_000_000),
            stats = UserStats(totalMessages = 12),
            isLoadingStats = false,
        )
        assertThat(details.stats?.memberSinceEpochMillis).isEqualTo(1_700_000_000_000)
        assertThat(details.stats?.chips).isInstanceOf(ProfileStatChips.Shown::class.java)
    }
}
