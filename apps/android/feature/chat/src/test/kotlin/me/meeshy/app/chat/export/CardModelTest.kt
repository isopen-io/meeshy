package me.meeshy.app.chat.export

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CardModelTest {

    private val measure: CardMeasure = { text, font -> text.length * font.size * 0.5 }

    private fun decorated(input: CardInput) = CardDecorator(input).decorated(CardLayoutEngine.layout(input, measure))

    private fun input(decor: CardDecor, quote: String? = "Tu viens ?", tilt: CardTilt = CardTilt.NONE) = CardInput(
        quoted = quote?.let { CardPart("Koffi", it) },
        reply = CardPart("Awa", "Oui, j'arrive"),
        template = CardTemplates.defaultId,
        handle = "moi",
        tilt = tilt,
        decor = decor,
    )

    private fun brand(fields: String) =
        """[{"id": "@acme/carte", "names": {"fr": "Carte"}, "palette": "aurore", "typeface": "rond", "link": "orbite"$fields}]"""

    @Test
    fun `the eight built-in models are those of iOS, each a valid sheet`() {
        assertThat(CardModels.builtIn.map { it.id })
            .containsExactly("citation", "bulles", "affiche", "editorial", "carnet", "bandeau", "manifeste", "epure").inOrder()
        assertThat(CardModels.model(CardModels.DEFAULT_ID)?.template).isEqualTo(CardTemplates.defaultId)
    }

    @Test
    fun `a model is named in the reader's language, french as fallback`() {
        val poster = CardModels.model("affiche")!!
        assertThat(poster.name("en-US")).isEqualTo("Poster")
        assertThat(poster.name("ar")).isEqualTo("ملصق")
        assertThat(poster.name("ja")).isEqualTo("Affiche")
    }

    @Test
    fun `applying a model keeps what the user chose to show and takes the look of the model`() {
        val shown = CardFormat.initial.copy(showDate = true, anonymizeReply = true)
        val format = CardModels.model("carnet")!!.applied(shown)
        assertThat(format.showDate).isTrue()
        assertThat(format.anonymizeReply).isTrue()
        assertThat(format.model).isEqualTo("carnet")
        assertThat(format.template).isEqualTo(CardTemplateId(CardPaletteId.MANUSCRIT, CardTypefaceId.PLUME, CardLinkId.FIL))
        assertThat(format.authorPlacement).isEqualTo(CardAuthorPlacement.AFTER)
        assertThat(format.tilt).isEqualTo(CardTilt.LEFT)
        assertThat(format.decor.frame).isEqualTo(CardDecor.Frame.PANEL)
    }

    @Test
    fun `a model offers only its links, all of them when it names none`() {
        val bubbles = CardModels.model("bulles")!!
        assertThat(bubbles.offeredLinks).containsExactly(CardLinkId.BULLES)
        assertThat(bubbles.accepts(CardLinkId.FIL)).isFalse()
        assertThat(CardModels.model("citation")!!.offeredLinks).containsExactlyElementsIn(CardLinkId.entries)
    }

    @Test
    fun `a brand sheet is read by the same decoder`() {
        val models = CardModels.decode(brand(""", "aspect": "story", "decor": {"alignment": "center", "frame": "border", "ornament": "none"}"""))
        assertThat(models?.single()?.aspect).isEqualTo(CardAspect.STORY)
        assertThat(models?.single()?.decor?.frame).isEqualTo(CardDecor.Frame.BORDER)
    }

    @Test
    fun `an unknown value, a bad id, a foreign link or a duplicate refuse the whole list`() {
        assertThat(CardModels.decode(brand(""", "aspect": "cinema""""))).isNull()
        assertThat(CardModels.decode(brand(""", "links": ["fil"]"""))).isNull()
        assertThat(CardModels.decode(brand("").replace("@acme/carte", "Acme Carte"))).isNull()
        assertThat(CardModels.decode(brand("").replace("palette\": \"aurore", "palette\": \"or"))).isNull()
        val one = brand("").removePrefix("[").removeSuffix("]")
        assertThat(CardModels.decode("[$one, $one]")).isNull()
    }

    @Test
    fun `brand ids are lowercase letters, digits and dashes under an at sign`() {
        assertThat(CardModels.isValidId("citation")).isTrue()
        assertThat(CardModels.isValidId("@acme/mon-style-2")).isTrue()
        assertThat(CardModels.isValidId("@acme")).isFalse()
        assertThat(CardModels.isValidId("acme/carte")).isFalse()
        assertThat(CardModels.isValidId("Citation")).isFalse()
        assertThat(CardModels.isValidId("")).isFalse()
    }

    @Test
    fun `the model and its decor survive serialization, and a plain format writes neither`() {
        val format = CardModels.model("epure")!!.applied(CardFormat.initial)
        assertThat(CardFormat.parse(format.serialized)).isEqualTo(format)
        assertThat(CardFormat.initial.serialized).doesNotContain("model")
        assertThat(CardFormat.initial.serialized).doesNotContain("ornament")
    }

    @Test
    fun `no decor leaves the card exactly as before`() {
        val plain = input(CardDecor.NONE)
        assertThat(decorated(plain)).isEqualTo(CardLayoutEngine.layout(plain, measure))
    }

    @Test
    fun `a centered decor centers the lines and drops the quote bar`() {
        val card = decorated(input(CardDecor(alignment = CardDecor.Alignment.CENTER)))
        val texts = card.ops.filterIsInstance<CardOp.Text>()
        assertThat(texts.filter { it.align == CardAlignment.CENTER }).isNotEmpty()
        assertThat(card.ops.filterIsInstance<CardOp.Bar>().none { it.width == CardMetrics.BAR_WIDTH }).isTrue()
    }

    @Test
    fun `a border frames the whole card behind the content`() {
        val card = decorated(input(CardDecor(frame = CardDecor.Frame.BORDER)))
        val edges = card.ops.take(4).filterIsInstance<CardOp.Bar>()
        assertThat(edges).hasSize(4)
        assertThat(edges.first().x).isEqualTo(CardDecorator.BORDER_INSET)
        assertThat(edges.first().width).isEqualTo(card.width - 2 * CardDecorator.BORDER_INSET)
    }

    @Test
    fun `a panel sits behind the content and tilts with the card`() {
        val flat = decorated(input(CardDecor(frame = CardDecor.Frame.PANEL)))
        assertThat(flat.ops.first()).isInstanceOf(CardOp.Panel::class.java)
        val tilted = decorated(input(CardDecor(frame = CardDecor.Frame.PANEL), tilt = CardTilt.LEFT))
        val group = tilted.ops.first() as CardOp.Group
        assertThat(group.rotation).isEqualTo(CardTilt.LEFT.radians)
        assertThat(group.ops.single()).isInstanceOf(CardOp.Panel::class.java)
    }

    @Test
    fun `an ornament signs the card in the accent color`() {
        val accent = CardTemplates.defaultId.palette.palette.accent
        val rule = decorated(input(CardDecor(ornament = CardDecor.Ornament.ACCENT_RULE))).ops.first() as CardOp.Bar
        assertThat(rule.width).isEqualTo(CardDecorator.RULE_WIDTH)
        assertThat(rule.color).isEqualTo(accent)
        val mark = decorated(input(CardDecor(ornament = CardDecor.Ornament.QUOTE_MARK))).ops.first() as CardOp.Text
        assertThat(mark.text).isEqualTo("“")
    }
}
