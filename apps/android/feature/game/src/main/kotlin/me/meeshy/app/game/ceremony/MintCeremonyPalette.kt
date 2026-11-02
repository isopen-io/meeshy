package me.meeshy.app.game.ceremony

import androidx.compose.ui.graphics.Color
import me.meeshy.sdk.model.game.MeeshEdition
import me.meeshy.sdk.model.game.ceremony.MintCeremonyInk
import me.meeshy.sdk.model.game.ceremony.MintCeremonyInkFamily

private fun hex(rgb: Long): Color = Color(0xFF000000 or rgb)

private fun rgba(r: Int, g: Int, b: Int, a: Float): Color = Color(r, g, b, (a * 255).toInt())

/**
 * LES COULEURS DE LA CÉRÉMONIE (miroir de `MintCeremonyPalette` iOS et de `apps/web/src/styles/game-ceremony.css`) :
 * une forge de nuit, la même en clair et en sombre ; la nuit violette du prisme.
 */
internal class MintCeremonyPalette(edition: MeeshEdition) {
    private val night = edition == MeeshEdition.Prism

    val bg: List<Color> = (if (night) listOf(0x211B42L, 0x0B0918L, 0x040309L) else listOf(0x2A2014L, 0x120D09L, 0x06050AL)).map(::hex)
    val orb: List<Color> = if (night) {
        listOf(Color.White, hex(0xD9C8FF), rgba(160, 120, 255, 0f))
    } else {
        listOf(hex(0xFFFBE6), hex(0xFFD27A), rgba(255, 190, 90, 0f))
    }
    private val weave = (if (edition == MeeshEdition.Gold) listOf(0xFFF1C2L, 0xFFD96BL, 0xFFC24DL) else listOf(0xFFF6DCL, 0xFFE6A6L, 0xFFD27AL)).map(::hex)
    val glow: List<Color> = when (edition) {
        MeeshEdition.Silver -> listOf(rgba(255, 240, 200, 0.75f), rgba(255, 214, 140, 0.3f), rgba(255, 200, 120, 0f))
        MeeshEdition.Gold -> listOf(rgba(255, 226, 140, 0.85f), rgba(255, 190, 70, 0.35f), rgba(255, 170, 40, 0f))
        MeeshEdition.Prism -> listOf(Color.White.copy(alpha = 0.8f), rgba(195, 160, 255, 0.35f), rgba(140, 200, 255, 0f))
    }
    val sign: Color = hex(if (night) 0xEFE4FF else 0xFFE7A8)
    val iris: List<Color> = listOf(0xFF8FB1L, 0xFFB36BL, 0xFFD36BL, 0x8FF0C4L, 0x8FC8FFL, 0xA99BFFL, 0xE39BFFL).map(::hex)
    private val silver = listOf(0xEEF1F6L, 0xC9CFDAL, 0xFFFFFFL, 0xDFE4ECL).map(::hex)
    private val gold = listOf(0xFFD36BL, 0xF2B136L, 0xFFE7A3L).map(::hex)
    private val diamond = listOf(0xF4FBFFL, 0xDFF3FFL).map(::hex)
    private val spark = listOf(0xFFE3A0L, 0xFFFFFFL).map(::hex)
    private val ash = hex(0x9AA0AD)
    val orbInk: Color = hex(0xE9D9B0)
    val steel: List<Color> = listOf(hex(0xD6DBE5), hex(0x7D8392))
    val anvil: List<Color> = listOf(hex(0x70778A), hex(0x2C2F37))
    val anvilTop: List<Color> = listOf(hex(0xA9AFBD), hex(0x5B6070))
    val die: List<Color> = listOf(hex(0x5D6270), hex(0xC9CFDB), hex(0x6D7280))
    val wood: List<Color> = listOf(hex(0x6B4423), hex(0xA8743F))
    val flash: List<Color> = listOf(Color.White, rgba(255, 250, 230, 0.85f), rgba(255, 240, 200, 0f))
    val ring: Color = rgba(255, 236, 180, 0.95f)
    val ray: Color = rgba(255, 214, 107, 0.55f)
    val tchak: Color = hex(0xFFCF5C)
    val signSub: Color = hex(0xCDBD8E)
    val say: Color = hex(0xF3EAFF)
    val hint: Color = Color.White.copy(alpha = 0.42f)
    val gloryInk: Color = hex(0x8FF0BD)
    val shade: Color = Color.Black.copy(alpha = 0.45f)
    val ombre: List<Color> = listOf(rgba(8, 6, 18, 0.97f), rgba(8, 6, 18, 0.86f), rgba(8, 6, 18, 0f))

    fun color(ink: MintCeremonyInk): Color {
        val family = when (ink.family) {
            MintCeremonyInkFamily.Weave -> weave
            MintCeremonyInkFamily.Iris -> iris
            MintCeremonyInkFamily.Silver -> silver
            MintCeremonyInkFamily.Gold -> gold
            MintCeremonyInkFamily.Diamond -> diamond
            MintCeremonyInkFamily.Spark -> spark
            MintCeremonyInkFamily.Ash -> listOf(ash)
        }
        return family[ink.tone % family.size]
    }
}
