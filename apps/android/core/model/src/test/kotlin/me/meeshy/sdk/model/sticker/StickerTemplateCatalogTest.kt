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
            "time.digital", "time.analog", "time.ribbon", "time.hourglass", "time.stopwatch",
            "time.calendarDay", "time.alarm", "time.timeTag", "time.moon", "time.pocketWatch",
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
        assertThat(StickerTemplateCatalog.templates(StickerTemplateFamily.TEXT).map { it.posedScale }.toSet()).containsExactly(1.0)
        assertThat(StickerTemplateCatalog.template("love.heartFrame")!!.posedScale).isEqualTo(1.4)
        assertThat(StickerTemplateCatalog.template("love.heartFrame")!!.animation).isEqualTo(StickerAnimation.HEARTBEAT)
    }

    @Test
    fun `un identifiant inconnu ne fabrique rien`() {
        assertThat(StickerTemplateCatalog.template("time.futureThing")).isNull()
        assertThat(StickerTemplateCatalog.fallbackEmoji("weather.sun")).isNull()
        assertThat(StickerTemplateCatalog.template("")).isNull()
    }

    @Test
    fun `les identifiants sont uniques`() {
        assertThat(StickerTemplateCatalog.all.map { it.id }).containsNoDuplicates()
    }

    @Test
    fun `les vingt familles ont dix gabarits chacune`() {
        assertThat(StickerTemplateFamily.entries).hasSize(20)
        StickerTemplateFamily.entries.forEach { assertThat(StickerTemplateCatalog.templates(it)).hasSize(10) }
        assertThat(StickerTemplateCatalog.all).hasSize(200)
        assertThat(StickerTemplateCatalog.all.map { it.family }.distinct()).containsExactlyElementsIn(StickerTemplateFamily.entries).inOrder()
    }

    @Test
    fun `chaque gabarit porte un emoji de repli, une echelle de pose et un mouvement qui dit sa reponse`() {
        assertThat(StickerTemplateCatalog.all.all { it.fallbackEmoji.isNotEmpty() && it.posedScale > 0.0 }).isTrue()
        assertThat(StickerTemplateCatalog.template("answer.yes")!!.animation).isEqualTo(StickerAnimation.POP)
        assertThat(StickerTemplateCatalog.template("answer.no")!!.animation).isEqualTo(StickerAnimation.SHAKE)
        assertThat(StickerTemplateCatalog.template("answer.maybe")!!.animation).isEqualTo(StickerAnimation.WOBBLE)
        assertThat(StickerTemplateCatalog.template("answer.what")!!.animation).isEqualTo(StickerAnimation.BOUNCE)
        assertThat(StickerTemplateCatalog.template("answer.ok")!!.animation).isNull()
        assertThat(StickerTemplateCatalog.template("answer.never")!!.animation).isNull()
    }

    @Test
    fun `les gabarits de lieu lisent le nom et le detail, l'amour datee lit la date`() {
        assertThat(StickerTemplateCatalog.template("location.pill")!!.slots.map { it.name }).containsExactly("placeName", "placeDetail").inOrder()
        assertThat(StickerTemplateCatalog.template("love.since")!!.slots.map { it.name }).containsExactly("date")
        assertThat(StickerTemplateCatalog.template("time.pocketWatch")!!.slots.map { it.name }).containsExactly("hour", "minute").inOrder()
    }

    @Test
    fun `seuls les cadres de la famille texte portent un emplacement de prose`() {
        assertThat(StickerTemplateCatalog.wordFrames.map { it.id }).containsExactlyElementsIn(
            StickerTemplateCatalog.templates(StickerTemplateFamily.TEXT).map { it.id },
        ).inOrder()
        assertThat(StickerTemplateCatalog.all.filter { it.takesProse }.map { it.family }.distinct()).containsExactly(StickerTemplateFamily.TEXT)
    }

    @Test
    fun `l'index est la position dans la palette`() {
        assertThat(StickerTemplateCatalog.index("location.pill")).isEqualTo(0)
        assertThat(StickerTemplateCatalog.index("music.note")).isEqualTo(190)
        assertThat(StickerTemplateCatalog.index("inconnu")).isNull()
    }

    @Test
    fun `les identifiants sont ceux du catalogue iOS`() {
        val ios = iosCatalogIds() ?: return
        assertThat(StickerTemplateCatalog.all.map { it.id }).containsExactlyElementsIn(ios)
    }

    private fun iosCatalogIds(): List<String>? {
        var dir: java.io.File? = java.io.File("").absoluteFile
        while (dir != null) {
            val story = java.io.File(dir, "packages/MeeshySDK/Sources/MeeshySDK/Models/Story")
            if (story.isDirectory) {
                val pattern = Regex("""public static let \w+ = "([a-z]+\.[A-Za-z]+)"""")
                return story.listFiles { f -> f.name.startsWith("StickerTemplateCatalog") }!!
                    .flatMap { f -> pattern.findAll(f.readText()).map { it.groupValues[1] }.toList() }
            }
            dir = dir.parentFile
        }
        return null
    }
}
