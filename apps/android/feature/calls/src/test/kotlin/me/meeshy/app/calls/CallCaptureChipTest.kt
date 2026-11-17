package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.sdk.model.call.CallCaptureKind
import org.junit.Test

/**
 * #17963 (R1.2, R1.4, R1.6, R1.8) — la puce « X capture l'écran de l'appel », miroir de iOS `CallTopBannerStackTests`
 * (PR #18364) : le verre teinté rouge du kit, celui du bandeau de partage ; 5 s lues dans le kit partagé ; rangée au premier
 * toucher avec les bannières et rendue au second ; et, chez qui capture, aucune puce mais une ligne à son nom au journal.
 */
class CallCaptureChipTest {

    private val commentLine = Regex("""^\s*(//|\*|/\*)""")

    private fun upward(relative: String): File = generateSequence(File("").absoluteFile) { it.parentFile }
        .map { File(it, relative) }
        .first { it.exists() }

    private fun code(name: String): String =
        File(upward("src/main/kotlin/me/meeshy/app/calls"), name).readLines()
            .filterNot { commentLine.containsMatchIn(it) }
            .joinToString("\n")

    private fun kitMilliseconds(name: String): Long {
        val kit = upward("packages/shared/types/call-capture.ts").readText()
        val literal = Regex("""export const $name = ([0-9_]+);""").find(kit)?.groupValues?.get(1)
            ?: error("$name introuvable dans le kit")
        return literal.replace("_", "").toLong()
    }

    /** R1.4 — une capture ponctuelle tient la puce le temps du kit partagé, 5 s, comme iOS et le web. */
    @Test
    fun `the chip lasts the kit screenshot alert TTL`() {
        val ttl = kitMilliseconds("CALL_SCREENSHOT_ALERT_TTL_MS")
        assertThat(ttl).isEqualTo(5_000L)
        assertThat(CallScreenshotResetTimer.WINDOW_MS).isEqualTo(ttl)
    }

    /**
     * R1.2 — la puce porte le verre teinté rouge du kit, la recette même de « Vous partagez votre écran » (teinte Error à
     * [BANNER_TINT_ALPHA]), par l'unique entrée du verre de l'appel ([CallGlassPlate]) : aucun cliquet de verre ne monte.
     * Plus d'aplat rouge, aucun bouton ; l'anneau blanc puis la phrase, 44 dp, une annonce TalkBack.
     */
    @Test
    fun `the chip wears the kit red tinted glass like the share banner`() {
        val capsule = code("CallCaptureViews.kt").substringAfter("internal fun CallCaptureCapsule(").substringBefore("\n}\n")

        assertThat(capsule).contains("CallGlassPlate(")
        assertThat(capsule).contains("shape = CircleShape")
        assertThat(capsule).contains("tint = MeeshyPalette.Error.copy(alpha = BANNER_TINT_ALPHA)")
        assertThat(capsule).doesNotContain("MeeshyGlassSurface(")
        assertThat(capsule).doesNotContain(".background(")
        assertThat(capsule).doesNotContain("clickable")
        assertThat(capsule).doesNotContain("Button(")
        assertThat(capsule).contains(".border(2.dp, Color.White, CircleShape)")
        assertThat(capsule).contains(".height(44.dp)")
        assertThat(capsule).contains("liveRegion = LiveRegionMode.Assertive")
    }

    /**
     * R1.6 — au premier toucher, la puce sort par le haut AVEC les bannières (loi 11) et revient au second, par le même
     * fondu que le bandeau de partage ([CallChromeFade] : « Réduire les animations » ⇒ fondu seul, transformation et opacité
     * lues au dessin). Rien ne change de ce qui la nourrit ni de la mesure de hauteur de la pile.
     */
    @Test
    fun `the chip stows by the top edge with the banners`() {
        val overlay = code("CallCaptureViews.kt").substringAfter("class CallCaptureBannerOverlay").substringBefore("@Module")

        assertThat(overlay).contains("CallBannerPresence(face)")
        assertThat(overlay).contains("CallChromeFade(")
        assertThat(overlay).contains("isVisible = context.chrome.isVisible(CallChromeElement.CaptureAlert)")
        assertThat(overlay).contains("onRevive = context.onChromeRevive")
        assertThat(overlay).contains("stowsToward = CallVerticalEdge.Top")
        assertThat(overlay).contains("edgeMargin = CallTopBannerStack.HEADER_ROW_CLEARANCE_DP.dp")
        assertThat(overlay).contains(".reportsTopBannerHeight(CallTopBanner.Capture)")
        assertThat(overlay.indexOf("CallChromeFade(")).isLessThan(overlay.indexOf("CallCaptureCapsule("))
    }

    /** R1.8 — ma propre capture entre au journal à MON nom (« Vous »), celle d'un autre garde le sien. */
    @Test
    fun `my own capture is named You in the live journal`() {
        val mine = CallLiveCapture(id = "m", kind = CallCaptureKind.SCREENSHOT, userId = "me", atMs = 1_000, elapsedLabel = "12:40", isLocal = true)
        val theirs = CallLiveCapture(id = "t", kind = CallCaptureKind.SCREENSHOT, userId = "u-awa", atMs = 1_000, elapsedLabel = "12:40", name = "Awa")

        assertThat(liveCaptureName(mine, selfId = null, youLabel = "Vous", peerName = "Awa")).isEqualTo("Vous")
        assertThat(liveCaptureName(theirs, selfId = null, youLabel = "Vous", peerName = "Équipe")).isEqualTo("Awa")
        assertThat(mine.copy(name = "Awa").isLocal).isTrue()
    }
}
