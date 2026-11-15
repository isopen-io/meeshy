package me.meeshy.sdk.model.legal

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class LegalDocumentLanguageTest {

    private fun initial(
        system: String? = null,
        regional: String? = null,
        custom: String? = null,
        device: String? = null,
    ) = LegalDocumentCatalog.initialLanguage(system, regional, custom, device)

    @Test
    fun `the system language opens the document when it is delivered`() {
        assertThat(initial(system = "en")).isEqualTo(LegalDocumentLanguage.ENGLISH)
        assertThat(initial(system = "pt-BR")).isEqualTo(LegalDocumentLanguage.PORTUGUESE)
    }

    @Test
    fun `a system language that is not delivered is skipped for the regional language`() {
        assertThat(initial(system = "de", regional = "es")).isEqualTo(LegalDocumentLanguage.SPANISH)
    }

    @Test
    fun `the custom destination language comes before the device locale`() {
        assertThat(initial(system = "zh", custom = "en", device = "es-ES")).isEqualTo(LegalDocumentLanguage.ENGLISH)
    }

    @Test
    fun `the device locale is the fourth rank`() {
        assertThat(initial(system = "de", regional = "it", custom = "ar", device = "pt_BR")).isEqualTo(LegalDocumentLanguage.PORTUGUESE)
    }

    @Test
    fun `French is the fallback when nothing delivered is found`() {
        assertThat(initial()).isEqualTo(LegalDocumentLanguage.FRENCH)
        assertThat(initial(system = "de", device = "ja")).isEqualTo(LegalDocumentLanguage.FRENCH)
    }

    @Test
    fun `fromCode ignores case and region and rejects unknown languages`() {
        assertThat(LegalDocumentLanguage.fromCode(" FR_ca ")).isEqualTo(LegalDocumentLanguage.FRENCH)
        assertThat(LegalDocumentLanguage.fromCode("de")).isNull()
        assertThat(LegalDocumentLanguage.fromCode(null)).isNull()
    }
}
