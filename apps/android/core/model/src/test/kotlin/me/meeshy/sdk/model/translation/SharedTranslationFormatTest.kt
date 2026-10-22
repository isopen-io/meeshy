package me.meeshy.sdk.model.translation

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SharedTranslationFormatTest {
    @Test
    fun `identifiant objet`() {
        assertThat(SharedTranslationFormat.isObjectId("64f0c0ffee0000000000c0de")).isTrue()
        assertThat(SharedTranslationFormat.isObjectId("64F0C0FFEE0000000000C0DE")).isTrue()
        listOf("", "64f0c0ffee0000000000c0d", "64f0c0ffee0000000000c0dez", "64f0c0ffee0000000000c0d|").forEach {
            assertThat(SharedTranslationFormat.isObjectId(it)).isFalse()
        }
    }

    @Test
    fun `code de langue avec region ou script`() {
        listOf("fr", "eng", "pt-BR", "pt_BR", "zh-Hans", "es-419", "en-abcdefgh").forEach {
            assertThat(SharedTranslationFormat.isLanguageCode(it)).isTrue()
        }
        listOf("", "f", "fran", "fr-", "fr-a", "fr-abcdefghi", "fr-B|R", "fr-BR-x", "f1", "fr--BR", "é").forEach {
            assertThat(SharedTranslationFormat.isLanguageCode(it)).isFalse()
        }
    }

    @Test
    fun `base64 canonique`() {
        assertThat(SharedTranslationFormat.isCanonicalBase64("QQ==")).isTrue()
        assertThat(SharedTranslationFormat.isCanonicalBase64("QR==")).isFalse()
        assertThat(SharedTranslationFormat.isCanonicalBase64("QUI=")).isTrue()
        assertThat(SharedTranslationFormat.isCanonicalBase64("QUJ=")).isFalse()
        assertThat(SharedTranslationFormat.isCanonicalBase64("QQ")).isFalse()
        assertThat(SharedTranslationFormat.isCanonicalBase64("QUJD\n")).isFalse()
    }

    @Test
    fun `version de la source`() {
        assertThat(SharedTranslationSourceVersion.of(null)).isEqualTo("original")
        assertThat(SharedTranslationSourceVersion.of(1_700_000_000_123L)).isEqualTo("2023-11-14T22:13:20.123Z")
        assertThat(SharedTranslationSourceVersion.of(-1L)).isEqualTo("1969-12-31T23:59:59.999Z")
    }
}
