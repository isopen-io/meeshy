package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CountryFlagTest {
    @Test fun `codes valides`() {
        assertThat(CountryFlag.emoji("FR")).isEqualTo("🇫🇷")
        assertThat(CountryFlag.emoji("us")).isEqualTo("🇺🇸")
        assertThat(CountryFlag.emoji("GB")).isEqualTo("🇬🇧")
    }

    @Test fun `codes invalides donnent vide`() {
        assertThat(CountryFlag.emoji("")).isEmpty()
        assertThat(CountryFlag.emoji("F")).isEmpty()
        assertThat(CountryFlag.emoji("FRA")).isEmpty()
        assertThat(CountryFlag.emoji("1A")).isEmpty()
        assertThat(CountryFlag.emoji("é1")).isEmpty()
    }
}
