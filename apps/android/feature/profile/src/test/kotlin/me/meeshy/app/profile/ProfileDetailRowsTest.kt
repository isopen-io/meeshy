package me.meeshy.app.profile

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PresenceState
import org.junit.Test

class ProfileDetailRowsTest {

    private fun header(
        systemLanguage: String? = null,
        regionalLanguage: String? = null,
        country: String? = null,
        timezone: String? = null,
    ) = ProfileHeaderPresentation(
        displayName = "Alice",
        handle = "@alice",
        bio = null,
        avatarUrl = null,
        presence = PresenceState.OFFLINE,
        completionPercent = null,
        hasE2EE = false,
        memberSinceEpochMillis = null,
        systemLanguage = systemLanguage,
        regionalLanguage = regionalLanguage,
        country = country,
        timezone = timezone,
    )

    // ---- empty / absent --------------------------------------------------

    @Test
    fun `no detail fields yields an empty list`() {
        assertThat(ProfileDetailRows.build(header())).isEmpty()
    }

    // ---- system language -------------------------------------------------

    @Test
    fun `known system language resolves to its flag and name`() {
        val rows = ProfileDetailRows.build(header(systemLanguage = "fr"))
        assertThat(rows).hasSize(1)
        val row = rows.single()
        assertThat(row.kind).isEqualTo(ProfileDetailKind.SYSTEM_LANGUAGE)
        assertThat(row.flag).isEqualTo("🇫🇷")
        assertThat(row.value).isEqualTo("French")
    }

    @Test
    fun `uppercase system language code still resolves case-insensitively`() {
        val row = ProfileDetailRows.build(header(systemLanguage = "FR")).single()
        assertThat(row.flag).isEqualTo("🇫🇷")
        assertThat(row.value).isEqualTo("French")
    }

    @Test
    fun `unknown system language code degrades to no flag and the uppercased code`() {
        val row = ProfileDetailRows.build(header(systemLanguage = "xx")).single()
        assertThat(row.kind).isEqualTo(ProfileDetailKind.SYSTEM_LANGUAGE)
        assertThat(row.flag).isNull()
        assertThat(row.value).isEqualTo("XX")
    }

    // ---- regional language ----------------------------------------------

    @Test
    fun `distinct regional language is emitted as its own row after the system one`() {
        val rows = ProfileDetailRows.build(header(systemLanguage = "fr", regionalLanguage = "en"))
        assertThat(rows.map { it.kind })
            .containsExactly(ProfileDetailKind.SYSTEM_LANGUAGE, ProfileDetailKind.REGIONAL_LANGUAGE)
            .inOrder()
        val regional = rows[1]
        assertThat(regional.flag).isEqualTo("🇬🇧")
        assertThat(regional.value).isEqualTo("English")
    }

    @Test
    fun `regional language equal to system language is collapsed`() {
        val rows = ProfileDetailRows.build(header(systemLanguage = "fr", regionalLanguage = "fr"))
        assertThat(rows.map { it.kind }).containsExactly(ProfileDetailKind.SYSTEM_LANGUAGE)
    }

    @Test
    fun `regional language matching system language case-insensitively is collapsed`() {
        val rows = ProfileDetailRows.build(header(systemLanguage = "fr", regionalLanguage = "FR"))
        assertThat(rows.map { it.kind }).containsExactly(ProfileDetailKind.SYSTEM_LANGUAGE)
    }

    @Test
    fun `regional language shows even when no system language is set`() {
        val row = ProfileDetailRows.build(header(regionalLanguage = "es")).single()
        assertThat(row.kind).isEqualTo(ProfileDetailKind.REGIONAL_LANGUAGE)
        assertThat(row.value).isEqualTo("Spanish")
    }

    // ---- country ---------------------------------------------------------

    @Test
    fun `two-letter country code resolves to a flag and the uppercased code`() {
        val row = ProfileDetailRows.build(header(country = "fr")).single()
        assertThat(row.kind).isEqualTo(ProfileDetailKind.COUNTRY)
        assertThat(row.flag).isEqualTo("🇫🇷")
        assertThat(row.value).isEqualTo("FR")
    }

    @Test
    fun `uppercase two-letter country code keeps the flag`() {
        assertThat(ProfileDetailRows.build(header(country = "US")).single().flag).isEqualTo("🇺🇸")
    }

    @Test
    fun `non two-letter country value has no flag and keeps its text`() {
        val row = ProfileDetailRows.build(header(country = "France")).single()
        assertThat(row.flag).isNull()
        assertThat(row.value).isEqualTo("France")
    }

    @Test
    fun `two-character country with a non-letter has no flag`() {
        val row = ProfileDetailRows.build(header(country = "F1")).single()
        assertThat(row.flag).isNull()
        assertThat(row.value).isEqualTo("F1")
    }

    // ---- timezone --------------------------------------------------------

    @Test
    fun `timezone is emitted as a flagless row with its raw value`() {
        val row = ProfileDetailRows.build(header(timezone = "Europe/Paris")).single()
        assertThat(row.kind).isEqualTo(ProfileDetailKind.TIMEZONE)
        assertThat(row.flag).isNull()
        assertThat(row.value).isEqualTo("Europe/Paris")
    }

    // ---- ordering & composition -----------------------------------------

    @Test
    fun `all rows appear in language then country then timezone order`() {
        val rows = ProfileDetailRows.build(
            header(systemLanguage = "fr", regionalLanguage = "en", country = "US", timezone = "Europe/Paris"),
        )
        assertThat(rows.map { it.kind }).containsExactly(
            ProfileDetailKind.SYSTEM_LANGUAGE,
            ProfileDetailKind.REGIONAL_LANGUAGE,
            ProfileDetailKind.COUNTRY,
            ProfileDetailKind.TIMEZONE,
        ).inOrder()
    }
}
