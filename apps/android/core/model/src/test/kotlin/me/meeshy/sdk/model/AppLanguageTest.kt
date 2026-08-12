package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Pure interface-language preference logic — the supported set, the storage codec,
 * and the effective-locale resolver. This is the single source of truth the app-level
 * locale override and the settings picker both read; it must be total over any input
 * and robust to any garbage/legacy persisted string (never crash, degrade to "System").
 *
 * `null` is the canonical "follow the device locale" (System) value throughout.
 */
class AppLanguageTest {

    @Test
    fun supportedCodes_areTheInterfaceLanguages() {
        assertThat(AppLanguage.supportedCodes)
            .containsExactly("fr", "en", "es", "ar")
            .inOrder()
    }

    @Test
    fun supportedLanguages_exposeTheStaticMetadata() {
        assertThat(AppLanguage.supportedLanguages.map { it.code })
            .isEqualTo(AppLanguage.supportedCodes)
    }

    @Test
    fun isSupported_trueForEverySupportedCode() {
        AppLanguage.supportedCodes.forEach { code ->
            assertThat(AppLanguage.isSupported(code)).isTrue()
        }
    }

    @Test
    fun isSupported_isCaseAndWhitespaceInsensitive() {
        assertThat(AppLanguage.isSupported("  FR ")).isTrue()
        assertThat(AppLanguage.isSupported("Es")).isTrue()
    }

    @Test
    fun isSupported_falseForNullBlankAndUnknown() {
        assertThat(AppLanguage.isSupported(null)).isFalse()
        assertThat(AppLanguage.isSupported("")).isFalse()
        assertThat(AppLanguage.isSupported("   ")).isFalse()
        assertThat(AppLanguage.isSupported("de")).isFalse()
        assertThat(AppLanguage.isSupported("xyz")).isFalse()
    }

    @Test
    fun fromStorage_nullBlankAndSystemTokenDecodeToSystem() {
        assertThat(AppLanguage.fromStorage(null)).isNull()
        assertThat(AppLanguage.fromStorage("")).isNull()
        assertThat(AppLanguage.fromStorage("   ")).isNull()
        assertThat(AppLanguage.fromStorage("system")).isNull()
        assertThat(AppLanguage.fromStorage("  SYSTEM ")).isNull()
    }

    @Test
    fun fromStorage_supportedCodeDecodesToItself() {
        assertThat(AppLanguage.fromStorage("fr")).isEqualTo("fr")
        assertThat(AppLanguage.fromStorage("  Es ")).isEqualTo("es")
        assertThat(AppLanguage.fromStorage("AR")).isEqualTo("ar")
    }

    @Test
    fun fromStorage_unsupportedOrGarbageDecodesToSystem() {
        assertThat(AppLanguage.fromStorage("de")).isNull()
        assertThat(AppLanguage.fromStorage("klingon")).isNull()
    }

    @Test
    fun storageValue_systemPreferenceEncodesToSystemToken() {
        assertThat(AppLanguage.storageValue(null)).isEqualTo("system")
    }

    @Test
    fun storageValue_supportedCodeEncodesToItsCanonicalCode() {
        assertThat(AppLanguage.storageValue("fr")).isEqualTo("fr")
        assertThat(AppLanguage.storageValue("  AR ")).isEqualTo("ar")
    }

    @Test
    fun storageValue_unsupportedPreferenceEncodesToSystemToken() {
        assertThat(AppLanguage.storageValue("de")).isEqualTo("system")
        assertThat(AppLanguage.storageValue("")).isEqualTo("system")
    }

    @Test
    fun codec_roundTripsEverySupportedCodeAndSystem() {
        assertThat(AppLanguage.fromStorage(AppLanguage.storageValue(null))).isNull()
        AppLanguage.supportedCodes.forEach { code ->
            assertThat(AppLanguage.fromStorage(AppLanguage.storageValue(code))).isEqualTo(code)
        }
    }

    @Test
    fun resolveInterfaceLocaleTag_systemPreferenceFollowsDevice() {
        assertThat(AppLanguage.resolveInterfaceLocaleTag(null)).isNull()
    }

    @Test
    fun resolveInterfaceLocaleTag_supportedCodeForcesThatLocale() {
        assertThat(AppLanguage.resolveInterfaceLocaleTag("fr")).isEqualTo("fr")
        assertThat(AppLanguage.resolveInterfaceLocaleTag("  AR ")).isEqualTo("ar")
    }

    @Test
    fun resolveInterfaceLocaleTag_unsupportedCodeFollowsDeviceDefensively() {
        assertThat(AppLanguage.resolveInterfaceLocaleTag("de")).isNull()
        assertThat(AppLanguage.resolveInterfaceLocaleTag("")).isNull()
    }

    @Test
    fun info_returnsMetadataForSupportedCode() {
        val fr = AppLanguage.info("fr")
        assertThat(fr).isNotNull()
        assertThat(fr!!.nativeName).isEqualTo("Francais")
    }

    @Test
    fun info_isCaseInsensitive() {
        assertThat(AppLanguage.info("AR")?.code).isEqualTo("ar")
    }

    @Test
    fun info_nullForSystemAndUnsupported() {
        assertThat(AppLanguage.info(null)).isNull()
        assertThat(AppLanguage.info("de")).isNull()
    }
}
