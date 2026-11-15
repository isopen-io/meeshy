package me.meeshy.sdk.model.external

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import me.meeshy.sdk.model.report.ReportReason
import org.junit.Test

/**
 * #17120 — ce qui part sur le fil : la version de l'information que ce client montre, jamais une
 * date ; le texte d'un signalement seulement s'il a été joint ; et une entrée inconnue de la liste
 * de ce qui part chez Meta s'ignore au lieu de faire échouer le décodage.
 */
class ExternalInteropTest {

    private val json = Json { explicitNulls = false; ignoreUnknownKeys = true }

    @Test
    fun `the consent body carries the notice version and no date`() {
        val body = keysOf(json.encodeToString(ExternalInteropConsentRequest.serializer(), ExternalInteropConsentRequest.whatsapp(granted = true)))

        assertThat(body).containsExactly("network", "noticeVersion", "granted")
        assertThat(ExternalInteropConsentRequest.whatsapp(true).noticeVersion).isEqualTo(ExternalInteropNotice.VERSION)
    }

    @Test
    fun `a report without joined text sends no text`() {
        val request = ExternalReportRequest.of(ReportReason.SPAM, blockPeer = true, joinedText = "   ")

        assertThat(request.disclosedText).isNull()
        assertThat(keysOf(json.encodeToString(ExternalReportRequest.serializer(), request))).containsExactly("reportType", "blockPeer")
    }

    @Test
    fun `a report with joined text sends it trimmed and bounded`() {
        val request = ExternalReportRequest.of(ReportReason.HARASSMENT, blockPeer = false, joinedText = "  texte fictif  ")

        assertThat(request.reportType).isEqualTo("harassment")
        assertThat(request.disclosedText).isEqualTo("texte fictif")
        val long = ExternalReportRequest.of(ReportReason.OTHER, blockPeer = true, joinedText = "x".repeat(2500))
        assertThat(long.disclosedText!!.length).isEqualTo(ExternalReportRequest.MAX_DISCLOSED_TEXT_LENGTH)
    }

    @Test
    fun `an unknown disclosure is ignored, the known ones keep their order`() {
        val status = json.decodeFromString(
            ExternalInteropConsentStatus.serializer(),
            """{"network":"whatsapp","noticeVersion":"2026-11-10","disclosures":["phone-number","future-entry","delivery-metadata"],"retentionDays":90,"consent":null,"current":false,"extra":1}""",
        )

        assertThat(status.knownDisclosures).containsExactly(
            ExternalInteropDisclosure.PHONE_NUMBER,
            ExternalInteropDisclosure.DELIVERY_METADATA,
        ).inOrder()
        assertThat(status.current).isFalse()
    }

    @Test
    fun `the notice version and the disclosures mirror the shared file`() {
        val shared = generateSequence(File("").absoluteFile) { it.parentFile }
            .map { File(it, "packages/shared/types/external-interop-compliance.ts") }
            .first { it.isFile }
            .readText()

        assertThat(shared).contains("EXTERNAL_INTEROP_NOTICE_VERSION = '${ExternalInteropNotice.VERSION}'")
        ExternalInteropDisclosure.entries.forEach { assertThat(shared).contains("'${it.wireValue}'") }
    }

    private fun keysOf(encoded: String): Set<String> = json.parseToJsonElement(encoded).jsonObject.keys
}
