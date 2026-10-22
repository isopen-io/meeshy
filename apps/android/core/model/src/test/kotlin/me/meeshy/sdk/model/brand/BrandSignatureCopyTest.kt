package me.meeshy.sdk.model.brand

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * La signature de marque (iOS `BrandSignature`) : « Meeshy <version> · <build> », puis le
 * crédit « by services.ceo » — une MARQUE, identique dans toutes les langues, qui ouvre la
 * plateforme (#10096). Le web lit la même chaîne (`BRAND_CREDIT`).
 */
class BrandSignatureCopyTest {

    @Test
    fun `the version line joins version and build around a middle dot`() {
        assertThat(BrandSignatureCopy.versionLine(version = "2.3.1", build = "412"))
            .isEqualTo("Meeshy 2.3.1 · 412")
    }

    @Test
    fun `a missing version or build falls back to the iOS defaults`() {
        assertThat(BrandSignatureCopy.versionLine(version = null, build = null))
            .isEqualTo("Meeshy 1.0.0 · 1")
        assertThat(BrandSignatureCopy.versionLine(version = " ", build = ""))
            .isEqualTo("Meeshy 1.0.0 · 1")
    }

    @Test
    fun `the stamp keeps version and build apart for the spoken label`() {
        val stamp = BrandSignatureCopy.stamp(version = " 2.3.1 ", build = null)

        assertThat(stamp.version).isEqualTo("2.3.1")
        assertThat(stamp.build).isEqualTo("1")
    }

    @Test
    fun `the credit is the brand string and points at the platform`() {
        assertThat(BrandSignatureCopy.CREDIT).isEqualTo("by services.ceo")
        assertThat(BrandSignatureCopy.CREDIT_URL).isEqualTo("https://services.ceo")
    }
}
