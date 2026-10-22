package me.meeshy.sdk.model.call.frames

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallFrameTextTest {

    private fun person(name: String, handle: String? = null) = CallFramePerson(id = name, name = name, handle = handle, isSelf = false)

    private fun texts(group: String? = null, isGroup: Boolean = false, date: String = "12 oct. 2026") =
        CallFrameTexts(groupName = group, isGroup = isGroup, date = date, accentHex = null)

    private val charWidth: (String, Double) -> Double = { text, size -> text.length * size }

    @Test
    fun `les noms se composent comme sur iOS et le web`() {
        assertThat(CallFrameText.namesText(listOf(person("Awa")))).isEqualTo("Awa")
        assertThat(CallFrameText.namesText(listOf(person("Awa"), person("Karim")))).isEqualTo("Awa & Karim")
        assertThat(CallFrameText.namesText(listOf(person("Awa"), person("Karim"), person("Lina")))).isEqualTo("Awa, Karim & Lina")
        assertThat(CallFrameText.namesText(listOf("Awa", "Karim", "Lina", "Omar", "Zoe").map { person(it) }))
            .isEqualTo("Awa, Karim, Lina + 2")
        assertThat(CallFrameText.namesText(emptyList())).isEmpty()
    }

    @Test
    fun `un nom vide est ecarte de la composition`() {
        assertThat(CallFrameText.namesText(listOf(person("  "), person("Awa")))).isEqualTo("Awa")
    }

    @Test
    fun `un pseudo porte un seul arobase`() {
        assertThat(CallFrameText.handleText("awa")).isEqualTo("@awa")
        assertThat(CallFrameText.handleText("@@awa")).isEqualTo("@awa")
        assertThat(CallFrameText.handleText("  @awa ")).isEqualTo("@awa")
    }

    @Test
    fun `la marque s ecrit en minuscules et ne passe jamais en capitales`() {
        val people = listOf(person("Awa"))
        assertThat(CallFrameText.titleText(CallFrameTitleSource.BRAND, people, texts())).isEqualTo("meeshy")
        assertThat(CallFrameText.titleText(CallFrameTitleSource.BRAND, people, texts(), CallFrameLetterCase.UPPER)).isEqualTo("meeshy")
        assertThat(CallFrameText.titleText(CallFrameTitleSource.NAMES, people, texts(), CallFrameLetterCase.UPPER)).isEqualTo("AWA")
    }

    @Test
    fun `le groupe ne s affiche qu en groupe avec un nom, sinon les noms`() {
        val people = listOf(person("Awa"), person("Karim"))
        assertThat(CallFrameText.titleText(CallFrameTitleSource.GROUP, people, texts(group = " Famille ", isGroup = true))).isEqualTo("Famille")
        assertThat(CallFrameText.titleText(CallFrameTitleSource.GROUP, people, texts(group = "Famille", isGroup = false))).isEqualTo("Awa & Karim")
        assertThat(CallFrameText.titleText(CallFrameTitleSource.GROUP, people, texts(group = "  ", isGroup = true))).isEqualTo("Awa & Karim")
    }

    @Test
    fun `la date est reprise telle quelle et les sources sans moteur n ecrivent rien`() {
        val people = listOf(person("Awa"))
        assertThat(CallFrameText.titleText(CallFrameTitleSource.DATE, people, texts())).isEqualTo("12 oct. 2026")
        assertThat(CallFrameText.titleText(CallFrameTitleSource.NONE, people, texts())).isEmpty()
        listOf(CallFrameTitleSource.TIME, CallFrameTitleSource.PLACE, CallFrameTitleSource.EMOTION).forEach {
            assertThat(CallFrameText.titleText(it, people, texts())).isEmpty()
        }
    }

    @Test
    fun `les lignes d une personne suivent le mode d affichage des noms`() {
        val awa = person("Awa", handle = "awa")
        assertThat(CallFrameText.personLines(awa, CallFrameNameShow.NONE)).isEmpty()
        assertThat(CallFrameText.personLines(awa, CallFrameNameShow.NAME)).containsExactly("Awa")
        assertThat(CallFrameText.personLines(awa, CallFrameNameShow.HANDLE)).containsExactly("@awa")
        assertThat(CallFrameText.personLines(awa, CallFrameNameShow.BOTH)).containsExactly("Awa", "@awa").inOrder()
        assertThat(CallFrameText.personLines(person("Awa"), CallFrameNameShow.HANDLE)).containsExactly("Awa")
        assertThat(CallFrameText.listEntry(awa, CallFrameNameShow.BOTH)).isEqualTo("Awa @awa")
    }

    @Test
    fun `un texte qui tient garde sa taille`() {
        val fitted = CallFrameText.fit("Awa", maxWidth = 100.0, size = 10.0, measure = charWidth)
        assertThat(fitted).isEqualTo(CallFrameFittedText("Awa", 10.0))
    }

    @Test
    fun `un texte long est reduit jusqu a soixante pour cent de sa taille`() {
        val fitted = CallFrameText.fit("abcdefghij", maxWidth = 80.0, size = 10.0, measure = charWidth)
        assertThat(fitted.text).isEqualTo("abcdefghij")
        assertThat(fitted.size).isWithin(1e-9).of(8.0)
    }

    @Test
    fun `un texte trop long est reduit a soixante pour cent puis tronque d une ellipse`() {
        val fitted = CallFrameText.fit("abcdefghij", maxWidth = 40.0, size = 10.0, measure = charWidth)
        assertThat(fitted.size).isWithin(1e-9).of(6.0)
        assertThat(fitted.text).endsWith("…")
        assertThat(charWidth(fitted.text, fitted.size)).isAtMost(40.0)
        assertThat(fitted.text).isEqualTo("abcdef…")
    }

    @Test
    fun `l ellipse ne coupe pas un caractere compose et n garde pas d espace avant elle`() {
        val fitted = CallFrameText.fit("ab 👨‍👩‍👧 cd", maxWidth = 3.0, size = 1.0, measure = { text, _ -> text.length.toDouble() * 0.5 })
        assertThat(fitted.text).isNotEmpty()
        assertThat(fitted.text.endsWith(" …")).isFalse()
        assertThat(fitted.text.contains("👨")).isEqualTo(fitted.text.contains("👧"))
    }

    @Test
    fun `une largeur nulle ne laisse aucun texte et un texte vide reste vide`() {
        assertThat(CallFrameText.fit("Awa", 0.0, 10.0, charWidth).text).isEmpty()
        assertThat(CallFrameText.fit("", 50.0, 10.0, charWidth).text).isEmpty()
    }

    @Test
    fun `quand meme l ellipse ne tient pas rien n est ecrit`() {
        assertThat(CallFrameText.fit("abcdef", maxWidth = 2.0, size = 10.0, measure = charWidth).text).isEmpty()
    }

    @Test
    fun `les textes de l appel retombent sur le titre connu du maillage hors conversation`() {
        val context = CallFrameCallContext(conversationId = null, knownGroupTitle = " Les cousins ", isGroupCall = true)
        val texts = CallFrameTextsRule.texts(conversation = null, context = context, date = "d")
        assertThat(texts.groupName).isEqualTo("Les cousins")
        assertThat(texts.isGroup).isTrue()
    }

    @Test
    fun `le nom personnalise prime sur le titre et un direct n a pas de nom de groupe`() {
        val context = CallFrameCallContext("c1", "Maillage", isGroupCall = false)
        val group = CallFrameConversationInfo("group", " Mon nom ", "Titre", "6366F1", "4338CA")
        val direct = CallFrameConversationInfo("direct", "Mon nom", "Titre", "zz", "4338CA")

        val grouped = CallFrameTextsRule.texts(group, context, "d")
        assertThat(grouped.groupName).isEqualTo("Mon nom")
        assertThat(grouped.accentHex).isEqualTo(CallFrameAccent("#6366F1", "#4338CA"))

        val tete = CallFrameTextsRule.texts(direct, context, "d")
        assertThat(tete.isGroup).isFalse()
        assertThat(tete.groupName).isNull()
        assertThat(tete.accentHex).isNull()
        assertThat(CallFrameTextsRule.isGroup("BOT")).isFalse()
        assertThat(CallFrameTextsRule.isGroup("community")).isTrue()
    }
}
