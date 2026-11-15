package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import java.time.ZoneId
import java.util.Locale
import org.junit.Test

class BirthDateRulesTest {

    private val instant = WireDate.epochMillis("2000-03-04T23:30:00.000Z")!!

    @Test
    fun `the civil day follows the device zone`() {
        assertThat(BirthDateRules.wireDay(instant, ZoneId.of("UTC"))).isEqualTo("2000-03-04")
        assertThat(BirthDateRules.wireDay(instant, ZoneId.of("Pacific/Auckland"))).isEqualTo("2000-03-05")
        assertThat(BirthDateRules.wireDay(instant, ZoneId.of("America/Los_Angeles"))).isEqualTo("2000-03-04")
    }

    @Test
    fun `the format ignores the default locale digits`() {
        val previous = Locale.getDefault()
        try {
            Locale.setDefault(Locale.forLanguageTag("ar-SA-u-nu-arab"))
            assertThat(BirthDateRules.wireDay(instant, ZoneId.of("UTC"))).isEqualTo("2000-03-04")
        } finally {
            Locale.setDefault(previous)
        }
    }

    @Test
    fun `a picker midnight UTC keeps the chosen day whatever the device zone`() {
        val pickerMidnight = WireDate.epochMillis("1999-12-31T00:00:00.000Z")!!

        assertThat(BirthDateRules.wireDayFromPicker(pickerMidnight)).isEqualTo("1999-12-31")
    }

    @Test
    fun `a minor restriction comes from the served flag`() {
        assertThat(BirthDateRules.restrictsWriting(BirthDateDeclaration("minor", true))).isTrue()
        assertThat(BirthDateRules.restrictsWriting(BirthDateDeclaration("adult", false))).isFalse()
    }

    @Test
    fun `refusals are classified by code before status`() {
        assertThat(BirthDateDeclarationError.classify(500, "BIRTH_DATE_ALREADY_SET")).isEqualTo(BirthDateDeclarationError.ALREADY_SET)
        assertThat(BirthDateDeclarationError.classify(422, null)).isEqualTo(BirthDateDeclarationError.BELOW_MINIMUM_AGE)
        assertThat(BirthDateDeclarationError.classify(404, null)).isEqualTo(BirthDateDeclarationError.UNSUPPORTED)
        assertThat(BirthDateDeclarationError.classify(400, null)).isEqualTo(BirthDateDeclarationError.INVALID_DATE)
        assertThat(BirthDateDeclarationError.classify(503, null)).isEqualTo(BirthDateDeclarationError.UNAVAILABLE)
    }
}
