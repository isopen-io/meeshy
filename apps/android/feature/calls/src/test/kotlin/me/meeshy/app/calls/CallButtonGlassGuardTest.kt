package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * #17323 — la garde de source de la pilule et de l'en-tête de l'appel, miroir de iOS `CallViewGlassGuardTests` : chaque
 * bouton porte SON verre, choisi par la loi pure ; aucun disque translucide dessiné à plat ne revient ; le bloc, les
 * boutons et la capsule passent par UN site de dessin (le cliquet du verre fait main, `KitGlassRatchetTest`, ne monte pas).
 */
class CallButtonGlassGuardTest {

    private val commentLine = Regex("""^\s*(//|\*|/\*)""")

    /** Non merci (cadre proposé), Refuser (enregistrement), puce d'ambiance, son et bascules de l'aperçu, Message (appel entrant), puces Audio | Vidéo (G3.2). */
    private val neighbourButtons = mapOf(
        "CallLiveFrameUi.kt" to 1,
        "CallRecordingConsentCard.kt" to 1,
        "CallFrameMoodChips.kt" to 1,
        "CallPreviewViews.kt" to 2,
        "IncomingCallScreen.kt" to 1,
        "CallRecordingControls.kt" to 1,
    )

    private fun calls(): File = generateSequence(File("").absoluteFile) { it.parentFile }
        .map { File(it, "src/main/kotlin/me/meeshy/app/calls") }
        .first { File(it, "CallControlGlass.kt").isFile }

    private fun code(name: String): String =
        File(calls(), name).readLines().filterNot { commentLine.containsMatchIn(it) }.joinToString("\n")

    private fun block(source: String, from: String, until: String): String {
        val start = source.indexOf(from)
        assertThat(start).isAtLeast(0)
        val end = source.indexOf(until, start + from.length)
        assertThat(end).isGreaterThan(start)
        return source.substring(start, end)
    }

    @Test
    fun `le disque d'un bouton est un verre choisi par la loi pure, pas un disque dessine`() {
        val glass = code("CallControlGlass.kt")
        val glyph = block(glass, "internal fun CallPillGlyph(", "private const val DISABLED_ALPHA")

        assertThat(glyph).contains("CallGlassButtonSurface(")
        assertThat(glyph).contains("role = kind.glassRole()")
        assertThat(glyph).contains("shape = CircleShape")
        assertThat(glyph).doesNotContain("Color.White.copy(alpha = 0.16f)")
        assertThat(glyph).doesNotContain("CallButtonFill.color(")
    }

    @Test
    fun `aucun disque translucide a plat ne reste dans la pilule, ses boutons et l'en-tete`() {
        for (name in listOf("CallControlGlass.kt", "CallControlsPill.kt", "CallHeaderBar.kt")) {
            val source = code(name)

            assertThat(source).doesNotContain("CallButtonFill.color(")
            assertThat(source).doesNotContain("Color.White.copy(alpha = 0.16f)")
        }
    }

    @Test
    fun `le verre de la pilule, de ses boutons et de l'en-tete a un seul site de dessin`() {
        val glass = code("CallControlGlass.kt")

        assertThat(Regex("""MeeshyGlassSurface\(""").findAll(glass).count()).isEqualTo(1)
        assertThat(code("CallHeaderBar.kt")).doesNotContain("MeeshyGlassSurface(")
        assertThat(code("CallControlsPill.kt")).doesNotContain("MeeshyGlassSurface(")
    }

    @Test
    fun `le bloc de la pilule, la capsule de l'en-tete et chaque bouton passent par le meme verre`() {
        val glass = code("CallControlGlass.kt")
        val blockOfPill = block(glass, "internal fun CallControlsGlass(", "internal fun CallPillHairline")
        val header = code("CallHeaderBar.kt")
        val chip = block(header, "private fun CallDurationChip(", "TransientCallSignalGlyph(strength)")

        assertThat(blockOfPill).contains("CallGlassPlate(")
        assertThat(chip).contains("CallGlassPlate(")
        assertThat(chip).contains("liquid = true")
        assertThat(chip).contains("CallButtonFill.pressedHighlight(pressed)")
        assertThat(header).contains("CallPillButton(")
    }

    @Test
    fun `le verre d'un bouton de l'appel est choisi par la loi pure, dessine par le seul site, et s'eclaircit sous le doigt`() {
        val surface = block(code("CallControlGlass.kt"), "internal fun CallGlassButtonSurface(", "internal fun CallControlsGlass(")

        assertThat(surface).contains("CallButtonGlassRule.treatment(role)")
        assertThat(surface).contains("CallGlassPlate(")
        assertThat(surface).contains("liquid = treatment.isInteractive")
        assertThat(surface).contains("CallButtonFill.backing(treatment, tone)")
        assertThat(surface).contains("CallButtonFill.pressedHighlight(isPressed && treatment.drawsPressHighlight)")
    }

    @Test
    fun `plus aucun disque translucide dessine a plat dans l'ecran d'appel, comme sur iOS`() {
        val files = calls().listFiles { file -> file.extension == "kt" }.orEmpty().toList()
        assertThat(files.size).isAtLeast(50)

        val flat = files.filter { "Color.White.copy(alpha = 0.16f)" in code(it.name) }.map { it.name }

        assertThat(flat).isEmpty()
    }

    @Test
    fun `les boutons voisins de la pilule portent le meme verre de bouton`() {
        for (name in neighbourButtons.keys) {
            val found = Regex("""CallGlassButtonSurface\(""").findAll(code(name)).count()

            assertThat(found).isEqualTo(neighbourButtons.getValue(name))
        }
    }

    @Test
    fun `Retour et Fermer d'une option de la pilule portent le verre du bouton d'appel, pas un IconButton nu (G3_6)`() {
        val panel = code("CallPillPanel.kt")
        val header = block(panel, "private fun PanelHeaderButton(", "}")

        assertThat(header).contains("CallPillButton(")
        assertThat(panel).doesNotContain("IconButton(")
    }

    @Test
    fun `la puce des autres participants est un verre, pas un disque`() {
        val chip = block(code("CallEffectsCompanionStrip.kt"), "private fun OverflowChip(", "Text(")

        assertThat(chip).contains("CallGlassPlate(")
        assertThat(chip).contains("shape = CircleShape")
        assertThat(chip).doesNotContain(".background(Color.White")
    }

    @Test
    fun `Fin reste rouge, et le retour au toucher du bouton est garde`() {
        val glass = code("CallControlGlass.kt")
        val fill = block(glass, "internal object CallButtonFill {", "internal val LocalCallChromeInteraction")

        assertThat(fill).contains("MeeshyPalette.Error")
        assertThat(fill).contains("PRESSED_SCALE: Float = 0.88f")
        assertThat(block(glass, "internal fun CallPillButton(", "Column(")).contains("HapticFeedbackType.TextHandleMove")
    }

    @Test
    fun `P17_2 - la puce du type, la barre d'avant le decroche et la puce du son sont du verre, pas un disque plein`() {
        val parts = code("IncomingVideoParts.kt")

        assertThat(Regex("""CallGlassPlate\(""").findAll(parts).count()).isEqualTo(2)
        assertThat(parts).doesNotContain("MeeshyGlassSurface(")
        assertThat(parts).doesNotContain("Color.White.copy(alpha = 0.16f)")
        assertThat(block(parts, "internal fun IncomingPreAnswerBar(", "private fun incomingExposureText")).contains("CallPillButton(")

        val sound = block(code("CallPreviewViews.kt"), "internal fun CallPreviewSoundButton(", "private fun CallPreviewSoundLabel(")
        assertThat(sound).contains("role = CallButtonRole.Neutral")
        assertThat(sound).doesNotContain("CallButtonRole.Active")
    }

    @Test
    fun `P17_4 - la plaque Vous de ma vignette est celle des tuiles, une capsule de verre et jamais un voile noir`() {
        val parts = code("IncomingVideoParts.kt")
        assertThat(parts).contains("CallTileNameplate(")
        assertThat(parts).doesNotContain("Color.Black")

        val tile = code("CallGroupTile.kt")
        val nameplate = block(tile, "internal fun CallTileNameplate(", "\n}")
        assertThat(nameplate).contains("CallGlassPlate(")
        assertThat(nameplate).contains("CallToneScrim()")
        assertThat(block(tile, "private fun CallGroupTilePlate(", "\n}")).contains("CallTileNameplate(")
    }

    @Test
    fun `P16_12 - le bandeau de partage reste le verre teinte de la surface partagee, a 48 dp`() {
        val banner = code("CallScreenShareBanner.kt")

        assertThat(banner).contains("MeeshyGlassSurface(")
        assertThat(banner).contains("CallTopBannerStack.BANNER_HEIGHT_DP")
        assertThat(banner).doesNotContain("44.dp")
    }

    @Test
    fun `S1 et S2 - Arreter est UNE capsule blanche a encre rouge, la meme sur la capsule de partage et sur le bandeau`() {
        val stop = block(code("CallPillControls.kt"), "internal fun CallShareStopButton(", "\n}")
        assertThat(stop).contains(".background(Color.White, CircleShape)")
        assertThat(stop).contains("color = MeeshyPalette.ErrorInk")
        assertThat(stop).doesNotContain("Color.White.copy(")

        assertThat(code("CallPill.kt")).contains("CallShareStopButton(")
        val banner = code("CallScreenShareBanner.kt")
        assertThat(banner).contains("CallShareStopButton(")
        assertThat(banner).doesNotContain("fun ScreenShareStopButton(")
    }
}
