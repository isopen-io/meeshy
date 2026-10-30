package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import java.time.ZoneId
import java.util.Locale
import me.meeshy.sdk.model.sticker.StickerPackItemSummary
import me.meeshy.sdk.model.sticker.StickerPackSummary
import me.meeshy.sdk.model.sticker.StickerSheetChoice
import org.junit.Test

class StickerChoiceRouteTest {

    private val now = Instant.parse("2026-10-30T13:07:00Z")
    private val paris = ZoneId.of("Europe/Paris")
    private val fruits = StickerPackSummary(
        slug = "fruits",
        items = listOf(StickerPackItemSummary(key = "pomme", emoji = "🍎", fileUrl = "/p.png")),
    )

    private fun route(choice: StickerSheetChoice) = StickerChoiceRoute.of(choice, listOf(fruits), now, paris, Locale.FRENCH)

    @Test
    fun `un emoji se pose en glyphe`() {
        assertThat(route(StickerSheetChoice.Emoji("😀"))).isEqualTo(StickerChoiceRoute.Glyph("😀"))
    }

    @Test
    fun `un gabarit d'heure rejoue depuis les recents prend l'heure du moment`() {
        val routed = route(StickerSheetChoice.Template("time.digital")) as StickerChoiceRoute.Template
        assertThat(routed.slots).containsExactly("time", "14:07", "hour", "14", "minute", "07")
    }

    @Test
    fun `un cadre a mots sans mots ou un gabarit inconnu ne se pose pas`() {
        assertThat(route(StickerSheetChoice.Template("text.neon"))).isNull()
        assertThat(route(StickerSheetChoice.Template("weather.sun"))).isNull()
    }

    @Test
    fun `un film de Mee se pose en image avec son emoji`() {
        assertThat(route(StickerSheetChoice.Mee("mee-coucou"))).isEqualTo(StickerChoiceRoute.MeeImage("mee-coucou", "👋"))
        assertThat(route(StickerSheetChoice.Mee("inconnu"))).isNull()
    }

    @Test
    fun `un sticker de pack se pose en image servie, un sticker absent ne se pose pas`() {
        assertThat(route(StickerSheetChoice.PackItem("fruits", "pomme"))).isEqualTo(StickerChoiceRoute.PackImage("/p.png", "🍎"))
        assertThat(route(StickerSheetChoice.PackItem("fruits", "poire"))).isNull()
    }

    @Test
    fun `une vignette de Mes stickers se pose depuis la bibliotheque`() {
        assertThat(route(StickerSheetChoice.Library("s1"))).isEqualTo(StickerChoiceRoute.LibraryImage("s1"))
    }
}
