package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Test

class UserPreferencesMergeTest {

    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `a patch overlays only the named fields of its block`() {
        val before = UserPreferences(privacy = PrivacyPreferences(showOnlineStatus = true, showReadReceipts = true))

        val after = before.withPatch(
            PreferenceCategory.PRIVACY,
            JsonObject(mapOf("showOnlineStatus" to JsonPrimitive(false))),
            json,
        )

        assertThat(after.privacy.showOnlineStatus).isFalse()
        assertThat(after.privacy.showReadReceipts).isTrue()
        assertThat(after.audio).isEqualTo(before.audio)
    }

    @Test
    fun `a patch the model cannot decode leaves the aggregate untouched`() {
        val before = UserPreferences()

        val after = before.withPatch(
            PreferenceCategory.PRIVACY,
            JsonObject(mapOf("showOnlineStatus" to JsonPrimitive("not-a-boolean"))),
            json,
        )

        assertThat(after).isEqualTo(before)
    }

    @Test
    fun `resetting a category restores its defaults and spares the others`() {
        val before = UserPreferences(
            privacy = PrivacyPreferences(showOnlineStatus = false),
            audio = AudioPreferences(),
        )

        val after = before.withCategoryReset(PreferenceCategory.PRIVACY)

        assertThat(after.privacy).isEqualTo(PrivacyPreferences())
        assertThat(after.audio).isEqualTo(before.audio)
    }

    @Test
    fun `route segments are the lowercase wire names`() {
        assertThat(PreferenceCategory.NOTIFICATION.routeSegment).isEqualTo("notification")
        assertThat(PreferenceCategory.APPLICATION.routeSegment).isEqualTo("application")
    }

    @Test
    fun `tags are trimmed, distinct and sorted ignoring case`() {
        val prefs = listOf(
            ApiConversationPreferences(tags = listOf("work", " Alpha ", "")),
            ApiConversationPreferences(tags = listOf("alpha", "Beta", "work")),
        )

        assertThat(prefs.distinctSortedTags()).containsExactly("Alpha", "alpha", "Beta", "work").inOrder()
    }
}
