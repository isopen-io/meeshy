package me.meeshy.sdk.model.sticker

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MessageSticker
import org.junit.Test

/** #14345 — les règles du dessin d'un Instant et sa recette, rejouées d'iOS (`MeeInstantText`, `MeeInstantBandLayout`). */
class MeeInstantDrawingTest {

    private val bonjour = MeeInstantCatalog.instant("mee.instant-bonjour")!!

    @Test
    fun `clip retire les espaces et coupe au-dela du maximum par une ellipse`() {
        assertThat(MeeInstantClip.clip("  Salut  ", max = 20)).isEqualTo("Salut")
        assertThat(MeeInstantClip.clip("abcdefghij", max = 5)).isEqualTo("abcd…")
        assertThat(MeeInstantClip.clip("abc defgh", max = 5)).isEqualTo("abc…")
    }

    @Test
    fun `un bandeau sans ligne douce tient sur une ligne`() {
        val layout = MeeInstantBandLayout.of(main = "Il pleut", sub = null)
        assertThat(layout.sub).isNull()
        assertThat(layout.rect).isEqualTo(MeeInstantBandLayout.Rect(14f, 158f, 172f, 34f))
        assertThat(layout.cornerRadius).isEqualTo(17f)
        assertThat(layout.mainSize).isEqualTo(19f)
        assertThat(layout.mainBaseline).isEqualTo(181f)
    }

    @Test
    fun `un bandeau a deux lignes s'agrandit et une ligne forte longue se reduit`() {
        val layout = MeeInstantBandLayout.of(main = "Une ligne bien longue", sub = "Paris")
        assertThat(layout.main).isEqualTo("Une ligne bien long…")
        assertThat(layout.sub).isEqualTo("Paris")
        assertThat(layout.rect).isEqualTo(MeeInstantBandLayout.Rect(14f, 148f, 172f, 46f))
        assertThat(layout.mainSize).isEqualTo(15f)
        assertThat(layout.mainBaseline).isEqualTo(169f)
        assertThat(layout.subBaseline).isEqualTo(186f)
    }

    @Test
    fun `une ligne douce vide ne compte pas`() {
        assertThat(MeeInstantBandLayout.of(main = "Bonjour", sub = "   ").sub).isNull()
    }

    @Test
    fun `un Instant part sous mee point id avec ses emplacements saisis et son emoji de repli`() {
        val sticker = bonjour.messageSticker(mapOf(MeeSlot.MESSAGE to " Coucou ", MeeSlot.PLACE to "Paris"))
        assertThat(sticker).isEqualTo(
            MessageSticker(templateId = "mee.instant-bonjour", slots = mapOf("message" to "Coucou"), emoji = bonjour.emoji),
        )
    }

    @Test
    fun `le choix d'un Instant porte ses emplacements au format du fil et ne laisse aucun recent`() {
        val choice = StickerSheetChoice.Instant(bonjour.id, mapOf("time" to "08:00"))
        assertThat(choice.slots).containsExactly("time", "08:00")
        assertThat(choice.usageEntry).isNull()
    }

    @Test
    fun `un Instant se retrouve par son identifiant nu`() {
        assertThat(MeeInstantCatalog.byId(bonjour.id)).isEqualTo(bonjour)
        assertThat(MeeInstantCatalog.byId("mee-inconnu")).isNull()
    }

    @Test
    fun `les emplacements saisis d'un Instant viennent des mots tapes et de l'heure de l'ouverture`() {
        val typed = MeeInstantCatalog.typedSlots(message = "  Hello ", time = "14:07")
        assertThat(typed).containsExactly(MeeSlot.MESSAGE, "Hello", MeeSlot.TIME, "14:07")
        assertThat(MeeInstantCatalog.typedSlots(message = " ", time = null)).isEmpty()
    }
}
