package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class UserDisplayNameTest {

    private val fallback = "Utilisateur inconnu"

    @Test fun `display name wins and is trimmed`() {
        assertThat(getUserDisplayName("  Ata Beth ", "A", "B", "atabeth", fallback)).isEqualTo("Ata Beth")
    }

    @Test fun `blank display name falls to first and last name`() {
        assertThat(getUserDisplayName("  ", "Ata", "Beth", "atabeth", fallback)).isEqualTo("Ata Beth")
    }

    @Test fun `a single name part is enough`() {
        assertThat(getUserDisplayName(null, null, "Beth", "atabeth", fallback)).isEqualTo("Beth")
    }

    @Test fun `username comes next`() {
        assertThat(getUserDisplayName(null, " ", null, "atabeth", fallback)).isEqualTo("atabeth")
    }

    @Test fun `nothing known gives the localized fallback`() {
        assertThat(getUserDisplayName(null, null, null, " ", fallback)).isEqualTo(fallback)
        assertThat(getUserDisplayName(null as MeeshyUser?, fallback)).isEqualTo(fallback)
    }

    @Test fun `a user is read through the same law`() {
        val user = MeeshyUser(id = "1", username = "ab", firstName = "Ata", lastName = "Beth")
        assertThat(getUserDisplayName(user, fallback)).isEqualTo("Ata Beth")
    }
}
