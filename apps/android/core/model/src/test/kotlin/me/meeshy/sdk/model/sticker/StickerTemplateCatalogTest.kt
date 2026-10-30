package me.meeshy.sdk.model.sticker

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StickerAnimation
import org.junit.Test

class StickerTemplateCatalogTest {

    @Test
    fun `les dix cadres a mots portent les identifiants d'iOS, dans l'ordre de la palette`() {
        assertThat(StickerTemplateCatalog.templates(StickerTemplateFamily.TEXT).map { it.id }).containsExactly(
            "text.speechBubble", "text.thoughtBubble", "text.stickyNote", "text.ribbon", "text.badge",
            "text.neon", "text.tag", "text.signboard", "text.tape", "text.stamp",
        ).inOrder()
    }

    @Test
    fun `les decorations d'heure servies portent les identifiants d'iOS`() {
        assertThat(StickerTemplateCatalog.templates(StickerTemplateFamily.TIME).map { it.id }).containsExactly(
            "time.digital", "time.analog", "time.ribbon", "time.calendarDay",
        ).inOrder()
    }

    @Test
    fun `un cadre a mots lit un seul emplacement de prose, une heure n'en lit aucun`() {
        val bubble = StickerTemplateCatalog.template("text.speechBubble")!!
        assertThat(bubble.slots).containsExactly(StickerTemplateSlot("text", StickerTemplateSlot.Nature.PROSE))
        assertThat(bubble.takesProse).isTrue()
        val digital = StickerTemplateCatalog.template("time.digital")!!
        assertThat(digital.slots.map { it.name }).containsExactly("time", "hour", "minute").inOrder()
        assertThat(digital.takesProse).isFalse()
        assertThat(StickerTemplateCatalog.template("time.calendarDay")!!.slots.map { it.name }).containsExactly("date")
    }

    @Test
    fun `les replis et les mouvements sont ceux d'iOS`() {
        assertThat(StickerTemplateCatalog.fallbackEmoji("text.speechBubble")).isEqualTo("💬")
        assertThat(StickerTemplateCatalog.fallbackEmoji("time.digital")).isEqualTo("🕐")
        assertThat(StickerTemplateCatalog.fallbackEmoji("time.calendarDay")).isEqualTo("📅")
        assertThat(StickerTemplateCatalog.template("text.neon")!!.animation).isEqualTo(StickerAnimation.BLINK)
        assertThat(StickerTemplateCatalog.template("text.stickyNote")!!.animation).isNull()
        assertThat(StickerTemplateCatalog.all.map { it.posedScale }.toSet()).containsExactly(1.0)
    }

    @Test
    fun `un identifiant inconnu ne fabrique rien`() {
        assertThat(StickerTemplateCatalog.template("time.hourglass")).isNull()
        assertThat(StickerTemplateCatalog.fallbackEmoji("weather.sun")).isNull()
        assertThat(StickerTemplateCatalog.template("")).isNull()
    }

    @Test
    fun `les identifiants sont uniques`() {
        assertThat(StickerTemplateCatalog.all.map { it.id }).containsNoDuplicates()
    }
}
