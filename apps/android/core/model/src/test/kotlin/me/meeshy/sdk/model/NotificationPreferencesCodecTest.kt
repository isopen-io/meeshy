package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * The pure notification-preference storage codec (feature-parity §L). Verifies that a
 * toggled block round-trips losslessly and that any blank/absent/corrupt/partial token
 * decodes into a coherent block instead of crashing.
 */
class NotificationPreferencesCodecTest {

    @Test
    fun roundTrip_preservesEveryToggledValue() {
        val prefs = UserNotificationPreferences(
            pushEnabled = false,
            soundEnabled = false,
            vibrationEnabled = false,
            newMessageEnabled = false,
            mentionEnabled = false,
            dndEnabled = true,
            dndStartTime = "23:30",
            dndEndTime = "07:15",
            dndDays = listOf(DndDay.MON, DndDay.SAT),
            showPreview = false,
        )

        val decoded = notificationPreferencesFromStorage(prefs.storageValue)

        assertThat(decoded).isEqualTo(prefs)
    }

    @Test
    fun roundTrip_ofDefaults_returnsDefaults() {
        val defaults = UserNotificationPreferences()

        val decoded = notificationPreferencesFromStorage(defaults.storageValue)

        assertThat(decoded).isEqualTo(defaults)
    }

    @Test
    fun storageValue_isNonEmptyJsonObject() {
        val token = UserNotificationPreferences().storageValue

        assertThat(token).startsWith("{")
        assertThat(token).contains("pushEnabled")
    }

    @Test
    fun fromStorage_null_returnsDefaults() {
        assertThat(notificationPreferencesFromStorage(null))
            .isEqualTo(UserNotificationPreferences())
    }

    @Test
    fun fromStorage_blank_returnsDefaults() {
        assertThat(notificationPreferencesFromStorage(""))
            .isEqualTo(UserNotificationPreferences())
    }

    @Test
    fun fromStorage_whitespace_returnsDefaults() {
        assertThat(notificationPreferencesFromStorage("   \n\t "))
            .isEqualTo(UserNotificationPreferences())
    }

    @Test
    fun fromStorage_corruptJson_returnsDefaultsWithoutThrowing() {
        assertThat(notificationPreferencesFromStorage("{not valid json"))
            .isEqualTo(UserNotificationPreferences())
    }

    @Test
    fun fromStorage_wrongShape_returnsDefaults() {
        assertThat(notificationPreferencesFromStorage("[1,2,3]"))
            .isEqualTo(UserNotificationPreferences())
    }

    @Test
    fun fromStorage_partialToken_fillsMissingFieldsWithDefaults() {
        val decoded = notificationPreferencesFromStorage("""{"pushEnabled":false}""")

        assertThat(decoded.pushEnabled).isFalse()
        assertThat(decoded.soundEnabled).isEqualTo(UserNotificationPreferences().soundEnabled)
        assertThat(decoded.newMessageEnabled).isEqualTo(UserNotificationPreferences().newMessageEnabled)
    }

    @Test
    fun fromStorage_unknownKeys_areIgnored() {
        val decoded = notificationPreferencesFromStorage(
            """{"pushEnabled":false,"legacyField":"gone","anotherOne":42}""",
        )

        assertThat(decoded.pushEnabled).isFalse()
        assertThat(decoded.soundEnabled).isTrue()
    }
}
