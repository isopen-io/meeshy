package me.meeshy.sdk.translation.device

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MlKitLanguageCodeMappingTest {

    @Test
    fun `a plain two letter code maps to itself`() {
        assertThat(MlKitLanguageCodeMapping.toMlKit("fr")).isEqualTo("fr")
        assertThat(MlKitLanguageCodeMapping.toMlKit("EN")).isEqualTo("en")
    }

    @Test
    fun `a regional spelling is reduced to two letters`() {
        assertThat(MlKitLanguageCodeMapping.toMlKit("pt-BR")).isEqualTo("pt")
        assertThat(MlKitLanguageCodeMapping.toMlKit("zh-Hant-HK")).isEqualTo("zh")
    }

    @Test
    fun `a three letter code is reduced through the explicit table`() {
        assertThat(MlKitLanguageCodeMapping.toMlKit("eng")).isEqualTo("en")
        assertThat(MlKitLanguageCodeMapping.toMlKit("swe")).isEqualTo("sv")
    }

    @Test
    fun `a language ML Kit does not translate is absent`() {
        assertThat(MlKitLanguageCodeMapping.toMlKit("bas")).isNull()
        assertThat(MlKitLanguageCodeMapping.toMlKit("")).isNull()
        assertThat(MlKitLanguageCodeMapping.toMlKit("??")).isNull()
    }
}
