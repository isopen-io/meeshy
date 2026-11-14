package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/**
 * #18215 (loi 18.1 · 18.5) et #18227 (planche E3 · E4) — les pastilles de service de l'appel : « En attente », « Vidéo réduite
 * / Faible lumière » et le micro coupé de l'autre sont du verre partagé ([CallGlassPlate]), jamais un voile dessiné à la main ;
 * les deux premières sont des maillons de la pile des bannières du haut, déclenchés par la loi pure `CallServicePillLaw` ; leurs
 * libellés parlent les sept langues.
 */
class CallServicePillsGuardTest {

    private val commentLine = Regex("""^\s*(//|\*|/\*)""")

    private fun calls(): File = generateSequence(File("").absoluteFile) { it.parentFile }
        .map { File(it, "src/main/kotlin/me/meeshy/app/calls") }
        .first { File(it, "CallControlGlass.kt").isFile }

    private fun res(): File = File(calls(), "../../../../../res").canonicalFile

    private fun code(name: String): String =
        File(calls(), name).readLines().filterNot { commentLine.containsMatchIn(it) }.joinToString("\n")

    private fun block(source: String, from: String, until: String): String {
        val start = source.indexOf(from)
        assertThat(start).isAtLeast(0)
        val end = source.indexOf(until, start + from.length)
        assertThat(end).isGreaterThan(start)
        return source.substring(start, end)
    }

    private val pills = listOf("CallHoldOverlay.kt", "CallVideoNoticePill.kt", "CallPeerMutedBadge.kt")

    @Test
    fun `loi 18_1 - les trois pastilles passent par le verre de l'ecran d'appel, plus par un voile dessine`() {
        for (name in pills) {
            val source = code(name)
            assertWithMessage(name).that(source).contains("CallGlassPlate(")
            assertWithMessage(name).that(source).contains("CallToneScrim()")
            assertWithMessage(name).that(source).doesNotContain("CallPalette.Veil")
            assertWithMessage(name).that(source).doesNotContain("MeeshyGlassSurface(")
            assertWithMessage(name).that(source).doesNotContain("import androidx.compose.foundation.background")
        }
    }

    @Test
    fun `E3 - En attente est un maillon de la pile des bannieres, plus une couche au centre de l'ecran`() {
        val overlay = block(code("CallHoldOverlay.kt"), "class CallHoldOverlay", "@Module")

        assertThat(overlay).contains("override val slot: CallOverlaySlot = CallOverlaySlot.TopBanner")
        assertThat(overlay).doesNotContain("CallOverlaySlot.Center")
        assertThat(overlay).contains("CallTopBannerStack.priority(CallTopBanner.Hold)")
        assertThat(overlay).contains("CallBannerPresence(")
        assertThat(overlay).contains("reportsTopBannerHeight(CallTopBanner.Hold)")
        assertThat(overlay).contains("servicePills()")
    }

    @Test
    fun `E4 - Video reduite est un maillon de la pile des bannieres, plus une couche posee a la main par l'ecran`() {
        val notice = code("CallVideoNoticePill.kt")
        val overlay = block(notice, "class CallVideoNoticeOverlay", "@Module")

        assertThat(overlay).contains("override val slot: CallOverlaySlot = CallOverlaySlot.TopBanner")
        assertThat(overlay).contains("CallTopBannerStack.priority(CallTopBanner.VideoNotice)")
        assertThat(overlay).contains("CallBannerPresence(")
        assertThat(overlay).contains("reportsTopBannerHeight(CallTopBanner.VideoNotice)")
        assertThat(overlay).contains("servicePills()")
        assertThat(notice).contains("@IntoSet")
        assertThat(code("CallScreen.kt")).doesNotContain("CallVideoNoticePill(")
    }

    /**
     * #18398 (loi 11, #17961 point 5) — au premier toucher, les deux pastilles sortent par le haut AVEC les bannières et
     * reviennent au second, par le chemin de la puce de capture (#18376) : [CallChromeFade] lit l'élément partagé
     * `CallChromeElement.ServicePill` (iOS `.servicePill`, #18396) ; « Réduire les animations » ⇒ fondu seul ; sous TalkBack,
     * la visibilité ne bascule jamais. Le fondu enveloppe la pastille, sous [CallBannerPresence] qui garde son entrée et sa
     * sortie, et la mesure de hauteur de la pile reste sur la pastille.
     */
    @Test
    fun `#18398 - En attente et Video reduite se rangent au premier toucher avec les bannieres`() {
        val overlays = mapOf(
            "CallHoldBadge(" to block(code("CallHoldOverlay.kt"), "class CallHoldOverlay", "@Module"),
            "CallVideoNoticePill(" to block(code("CallVideoNoticePill.kt"), "class CallVideoNoticeOverlay", "@Module"),
        )
        overlays.forEach { (pill, overlay) ->
            assertWithMessage(pill).that(overlay).contains("CallChromeFade(")
            assertWithMessage(pill).that(overlay).contains("isVisible = context.chrome.isVisible(CallChromeElement.ServicePill)")
            assertWithMessage(pill).that(overlay).contains("onRevive = context.onChromeRevive")
            assertWithMessage(pill).that(overlay).contains("stowsToward = CallVerticalEdge.Top")
            assertWithMessage(pill).that(overlay).contains("edgeMargin = CallTopBannerStack.HEADER_ROW_CLEARANCE_DP.dp")
            assertWithMessage(pill).that(overlay.indexOf("CallBannerPresence(")).isLessThan(overlay.indexOf("CallChromeFade("))
            assertWithMessage(pill).that(overlay.indexOf("CallChromeFade(")).isLessThan(overlay.indexOf(pill))
        }
    }

    @Test
    fun `#18227 - le declenchement des deux pastilles est la loi pure, lue en un seul site`() {
        val hold = code("CallHoldOverlay.kt")
        assertThat(hold).contains("CallServicePillLaw.of(")
        assertThat(Regex("""CallServicePillLaw\.of\(""").findAll(hold).count()).isEqualTo(1)
        assertThat(code("CallVideoNoticePill.kt")).doesNotContain("CallServicePillLaw.of(")
        assertThat(code("CallHoldOverlay.kt")).doesNotContain("override fun isVisible(state: CallUiState): Boolean = state.isOnHold")
    }

    @Test
    fun `E3 E4 - ma vignette et la grille de groupe cedent la place des pastilles, comme pour tout bandeau de la pile`() {
        val host = code("CallTopBannerStackHost.kt")
        assertThat(block(host, "internal fun rememberSelfTileBannerClearance(", "\n}")).contains("service = servicePills.banners")
        assertThat(block(host, "internal fun rememberGroupGridBannerClearance(", "\n}")).contains("service = servicePills.banners")

        val screen = code("CallScreen.kt")
        assertThat(screen).contains("overlayContext.servicePills()")
        assertThat(screen).doesNotContain("CallServicePillLaw.of(")
    }

    @Test
    fun `les pastilles se disent au lecteur d'ecran, le badge du micro coupe reste muet`() {
        assertThat(code("CallHoldOverlay.kt")).contains("liveRegion = LiveRegionMode.Polite")
        assertThat(code("CallVideoNoticePill.kt")).contains("liveRegion = LiveRegionMode.Polite")
        assertThat(code("CallPeerMutedBadge.kt")).contains("clearAndSetSemantics { }")
    }

    private val sevenFolders = listOf("values", "values-fr", "values-es", "values-pt", "values-de", "values-it", "values-ar")

    private val serviceKeys = listOf("call_service_channel_name", "call_service_on_hold", "call_service_reconnecting", "call_service_unmute")

    private fun strings(folder: String, file: String): Map<String, String> {
        val xml = File(res(), "$folder/$file")
        assertWithMessage("$folder/$file").that(xml.isFile).isTrue()
        return Regex("""<string name="([^"]+)"[^>]*>(.*?)</string>""").findAll(xml.readText())
            .associate { it.groupValues[1] to it.groupValues[2] }
    }

    @Test
    fun `loi 18_5 - En attente et les libelles du service d'appel parlent les sept langues`() {
        sevenFolders.forEach { folder ->
            val found = strings(folder, "strings_calls_service.xml")
            serviceKeys.forEach { key ->
                assertWithMessage("$folder : $key").that(found[key].orEmpty()).isNotEmpty()
            }
        }
    }

    @Test
    fun `loi 18_5 - une langue traduit, elle ne recopie pas l'anglais`() {
        val english = strings("values", "strings_calls_service.xml")
        listOf("values-de", "values-it", "values-ar").forEach { folder ->
            val found = strings(folder, "strings_calls_service.xml")
            assertWithMessage("$folder : call_service_on_hold").that(found["call_service_on_hold"]).isNotEqualTo(english["call_service_on_hold"])
            assertWithMessage("$folder : call_service_unmute").that(found["call_service_unmute"]).isNotEqualTo(english["call_service_unmute"])
        }
    }

    @Test
    fun `loi 18_5 - Video reduite et Faible lumiere parlent les sept langues`() {
        sevenFolders.forEach { folder ->
            val found = strings(folder, "strings_calls_thermal.xml")
            assertWithMessage("$folder : reduced").that(found["call_video_notice_reduced"].orEmpty()).isNotEmpty()
            assertWithMessage("$folder : low light").that(found["call_video_notice_low_light"].orEmpty()).isNotEmpty()
        }
    }
}
