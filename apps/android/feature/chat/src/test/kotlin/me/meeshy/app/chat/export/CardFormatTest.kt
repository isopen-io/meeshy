package me.meeshy.app.chat.export

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CardFormatTest {

    private class MemoryStore : CardPreferenceStore {
        val values = mutableMapOf<String, String>()
        override fun string(key: String): String? = values[key]
        override fun putString(key: String, value: String) { values[key] = value }
    }

    @Test
    fun `the initial format is the default template with authors shown`() {
        val format = CardFormat.initial
        assertThat(format.template).isEqualTo(CardTemplates.defaultId)
        assertThat(format.showAuthors).isTrue()
        assertThat(format.showDate).isFalse()
        assertThat(format.aspect).isEqualTo(CardAspect.AUTO)
    }

    @Test
    fun `a format survives serialization`() {
        val format = CardFormat(
            template = CardTemplateId(CardPaletteId.PECHE, CardTypefaceId.PLUME, CardLinkId.FIL),
            showConversationTitle = true, showDate = true, anonymizeQuoted = true, showTimes = true, useHandles = true,
            aspect = CardAspect.PORTRAIT, authorPlacement = CardAuthorPlacement.AFTER, tilt = CardTilt.RIGHT,
        )
        assertThat(CardFormat.parse(format.serialized)).isEqualTo(format)
    }

    @Test
    fun `a damaged or foreign value reads as no format, never an exception`() {
        assertThat(CardFormat.parse(null)).isNull()
        assertThat(CardFormat.parse("")).isNull()
        assertThat(CardFormat.parse("{not json")).isNull()
        assertThat(CardFormat.parse("""{"template":"nope.nope.nope","showConversationTitle":false,"showAuthors":true,"showDate":false,"anonymizeQuoted":false,"anonymizeReply":false}""")).isNull()
    }

    @Test
    fun `a format saved by iOS before the frame options reads with the standard disposition`() {
        val stored = """{"template":"minuit.affiche.fleche","showConversationTitle":false,"showAuthors":true,"showDate":true,"anonymizeQuoted":false,"anonymizeReply":false,"scales":{"reply":1.2},"audioStyle":"wave"}"""
        val parsed = CardFormat.parse(stored)!!
        assertThat(parsed.template.rawValue).isEqualTo("minuit.affiche.fleche")
        assertThat(parsed.showDate).isTrue()
        assertThat(parsed.aspect).isEqualTo(CardAspect.AUTO)
        assertThat(parsed.tilt).isEqualTo(CardTilt.NONE)
    }

    @Test
    fun `the default format is written to and read from the store`() {
        val store = MemoryStore()
        assertThat(CardFormat.readDefault(store)).isNull()
        val format = CardFormat.initial.copy(showDate = true)
        CardFormat.writeDefault(format, store)
        assertThat(CardFormat.readDefault(store)).isEqualTo(format)
        assertThat(store.values.keys).containsExactly("meeshy.export.message-card.default-format")
    }

    @Test
    fun `the details tab offers the title only when the conversation has one and anonymity only for a painted name`() {
        val format = CardFormat.initial
        assertThat(format.offeredToggles(hasConversationTitle = false, hasQuote = false))
            .containsExactly(CardToggle.SHOW_AUTHORS, CardToggle.ANONYMIZE_REPLY).inOrder()
        assertThat(format.offeredToggles(hasConversationTitle = true, hasQuote = true))
            .containsExactly(
                CardToggle.SHOW_CONVERSATION_TITLE, CardToggle.SHOW_AUTHORS,
                CardToggle.ANONYMIZE_QUOTED, CardToggle.ANONYMIZE_REPLY,
            ).inOrder()
        assertThat(format.copy(showAuthors = false).offeredToggles(hasConversationTitle = true, hasQuote = true))
            .containsExactly(CardToggle.SHOW_CONVERSATION_TITLE, CardToggle.SHOW_AUTHORS).inOrder()
    }

    @Test
    fun `the frame tab offers date and times, and handles only for painted names with known handles`() {
        val format = CardFormat.initial
        assertThat(format.frameToggles(hasHandles = false)).containsExactly(CardToggle.SHOW_DATE, CardToggle.SHOW_TIMES).inOrder()
        assertThat(format.frameToggles(hasHandles = true))
            .containsExactly(CardToggle.SHOW_DATE, CardToggle.SHOW_TIMES, CardToggle.USE_HANDLES).inOrder()
        assertThat(format.copy(showAuthors = false).frameToggles(hasHandles = true))
            .containsExactly(CardToggle.SHOW_DATE, CardToggle.SHOW_TIMES).inOrder()
    }

    @Test
    fun `a toggle reads and writes its own field only`() {
        val toggled = CardFormat.initial.with(CardToggle.SHOW_DATE, true)
        assertThat(toggled[CardToggle.SHOW_DATE]).isTrue()
        assertThat(toggled[CardToggle.SHOW_TIMES]).isFalse()
        assertThat(CardFormat.initial[CardToggle.SHOW_DATE]).isFalse()
    }

    @Test
    fun `each saved card counts once for its template and the popular ones lead the showcase`() {
        val store = MemoryStore()
        val chosen = CardTemplateId(CardPaletteId.CITRON, CardTypefaceId.MACHINE, CardLinkId.BULLES)
        CardUsage.record(chosen, store)
        CardUsage.record(chosen, store)
        assertThat(CardUsage.read(store)).containsExactly(chosen, 2)
        val popular = CardUsage.popular(CardUsage.read(store), count = 8)
        assertThat(popular).hasSize(1 + CardTemplates.featured.size)
        assertThat(popular.first()).isEqualTo(chosen)
        assertThat(popular.drop(1)).containsExactlyElementsIn(CardTemplates.featured).inOrder()
    }

    @Test
    fun `a damaged usage value reads as empty`() {
        val store = MemoryStore().apply { putString("meeshy.export.message-card.usage", "[1,2") }
        assertThat(CardUsage.read(store)).isEmpty()
    }
}
