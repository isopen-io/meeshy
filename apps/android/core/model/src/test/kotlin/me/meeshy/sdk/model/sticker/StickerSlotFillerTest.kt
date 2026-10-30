package me.meeshy.sdk.model.sticker

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import java.time.ZoneId
import java.util.Locale
import org.junit.Test

class StickerSlotFillerTest {
    private val instant = Instant.parse("2026-10-30T13:07:00Z")
    private val paris = ZoneId.of("Europe/Paris")

    @Test
    fun `l'heure se fige a l'instant recu, dans la locale de l'auteur, en nombres a deux chiffres`() {
        val slots = StickerSlotFiller.timeSlots(instant, paris, Locale.FRANCE)
        assertThat(slots["time"]).isEqualTo("14:07")
        assertThat(slots["hour"]).isEqualTo("14")
        assertThat(slots["minute"]).isEqualTo("07")
    }

    @Test
    fun `une autre locale ecrit l'heure a sa facon sans changer les nombres`() {
        val slots = StickerSlotFiller.timeSlots(instant, paris, Locale.US)
        assertThat(slots["time"]).contains("2:07")
        assertThat(slots["hour"]).isEqualTo("14")
    }

    @Test
    fun `la date s'ecrit en toutes lettres dans la locale de l'auteur`() {
        assertThat(StickerSlotFiller.dateSlots(instant, paris, Locale.FRANCE)["date"]).isEqualTo("30 octobre 2026")
    }

    @Test
    fun `un cadre a mots exige des mots, une heure se remplit seule`() {
        val bubble = StickerTemplateCatalog.template("text.speechBubble")!!
        assertThat(StickerSlotFiller.slotsFor(bubble, instant, paris, Locale.FRANCE, typed = "   ")).isNull()
        assertThat(StickerSlotFiller.slotsFor(bubble, instant, paris, Locale.FRANCE, typed = "  Salut  "))
            .containsExactly("text", "Salut")
        val calendar = StickerTemplateCatalog.template("time.calendarDay")!!
        assertThat(StickerSlotFiller.slotsFor(calendar, instant, paris, Locale.FRANCE, typed = ""))
            .containsExactly("date", "30 octobre 2026")
        val analog = StickerTemplateCatalog.template("time.analog")!!
        assertThat(StickerSlotFiller.slotsFor(analog, instant, paris, Locale.FRANCE, typed = "")!!.keys)
            .containsExactly("time", "hour", "minute")
    }
}
