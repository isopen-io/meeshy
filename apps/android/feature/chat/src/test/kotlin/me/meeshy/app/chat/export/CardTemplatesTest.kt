package me.meeshy.app.chat.export

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CardTemplatesTest {

    private val vocabulary = CardVocabulary(
        typeface = mapOf(
            CardTypefaceId.ROND to "Ronde", CardTypefaceId.DIDONE to "Didone", CardTypefaceId.PLUME to "Plume",
            CardTypefaceId.AFFICHE to "Affiche", CardTypefaceId.FUTUR to "Futuriste", CardTypefaceId.MACHINE to "Machine",
            CardTypefaceId.MARQUEUR to "Marqueur", CardTypefaceId.SYSTEME to "Système",
        ),
        link = CardLinkId.entries.associateWith { it.key.replaceFirstChar(Char::uppercase) },
        tone = mapOf(CardTone.DARK to "Sombre", CardTone.LIGHT to "Clair"),
    )

    @Test
    fun `fourteen palettes, eight typefaces and seven links make 784 templates`() {
        assertThat(CardTemplates.all).hasSize(14 * 8 * 7)
        assertThat(CardTemplates.all.toSet()).hasSize(784)
    }

    @Test
    fun `an identifier is palette dot typeface dot link and reads back to itself`() {
        val id = CardTemplateId(CardPaletteId.LAGON, CardTypefaceId.FUTUR, CardLinkId.FILET)
        assertThat(id.rawValue).isEqualTo("lagon.futur.filet")
        assertThat(CardTemplateId.parse("lagon.futur.filet")).isEqualTo(id)
        CardTemplates.all.forEach { assertThat(CardTemplateId.parse(it.rawValue)).isEqualTo(it) }
    }

    @Test
    fun `a stored identifier that names no template reads as null`() {
        assertThat(CardTemplateId.parse("aurore.rond")).isNull()
        assertThat(CardTemplateId.parse("aurore.rond.nope")).isNull()
        assertThat(CardTemplateId.parse("")).isNull()
        assertThat(CardTemplateId.parse(null)).isNull()
    }

    @Test
    fun `the default template is the web and iOS one`() {
        assertThat(CardTemplates.defaultId.rawValue).isEqualTo("aurore.rond.orbite")
    }

    @Test
    fun `a random template is picked by index from the 784, injected`() {
        assertThat(CardTemplates.random { 0.0 }).isEqualTo(CardTemplates.all.first())
        assertThat(CardTemplates.random { 0.999999 }).isEqualTo(CardTemplates.all.last())
    }

    @Test
    fun `dark palettes read white ink and light palettes read their own ink`() {
        assertThat(CardPaletteId.AURORE.palette.tone).isEqualTo(CardTone.DARK)
        assertThat(CardPaletteId.EDITORIAL.palette.tone).isEqualTo(CardTone.LIGHT)
        assertThat(CardPaletteId.entries.count { it.palette.tone == CardTone.DARK }).isEqualTo(7)
    }

    @Test
    fun `a hex colour reads its channels and an unreadable one reads black`() {
        val orange = CardColor.hex("#FB923C")
        assertThat(orange.red).isWithin(1e-9).of(251 / 255.0)
        assertThat(orange.blue).isWithin(1e-9).of(60 / 255.0)
        assertThat(CardColor.hex("zzz")).isEqualTo(CardColor(0.0, 0.0, 0.0))
    }

    @Test
    fun `the gallery order is a bijection of the 784 templates`() {
        assertThat(CardSearch.galleryOrder).hasSize(784)
        assertThat(CardSearch.galleryOrder.toSet()).isEqualTo(CardTemplates.all.toSet())
    }

    @Test
    fun `two neighbours of the gallery share neither palette nor typeface nor link`() {
        val order = CardSearch.galleryOrder
        val twins = order.zipWithNext().count { (a, b) ->
            a.palette == b.palette && a.typeface == b.typeface && a.link == b.link
        }
        assertThat(twins).isEqualTo(0)
    }

    @Test
    fun `an empty query returns everything and a word must begin a word of the template`() {
        assertThat(CardSearch.search("", vocabulary)).hasSize(784)
        val found = CardSearch.search("pl sombre", vocabulary)
        assertThat(found).isNotEmpty()
        assertThat(found.all { it.palette.palette.tone == CardTone.DARK }).isTrue()
        assertThat(found.all { it.typeface == CardTypefaceId.PLUME }).isTrue()
    }

    @Test
    fun `the search ignores case and accents`() {
        val withAccent = CardSearch.search("SYSTÈME", vocabulary)
        val without = CardSearch.search("systeme", vocabulary)
        assertThat(withAccent).isEqualTo(without)
        assertThat(withAccent).isNotEmpty()
    }

    @Test
    fun `the tone filter keeps only that tone`() {
        val light = CardSearch.search("", vocabulary, tone = CardTone.LIGHT)
        assertThat(light).hasSize(7 * 8 * 7)
        assertThat(light.all { it.palette.palette.tone == CardTone.LIGHT }).isTrue()
    }

    @Test
    fun `the most used templates come first`() {
        val loved = CardTemplateId(CardPaletteId.LAVANDE, CardTypefaceId.MARQUEUR, CardLinkId.SILENCE)
        val found = CardSearch.search("", vocabulary, usage = mapOf(loved to 3))
        assertThat(found.first()).isEqualTo(loved)
        assertThat(found).hasSize(784)
    }
}
