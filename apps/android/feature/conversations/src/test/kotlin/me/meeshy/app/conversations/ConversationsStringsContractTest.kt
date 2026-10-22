package me.meeshy.app.conversations

import android.content.res.Configuration
import android.content.res.Resources
import com.google.common.truth.Truth.assertThat
import java.io.File
import java.util.Locale
import me.meeshy.feature.conversations.R
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import javax.xml.parsers.DocumentBuilderFactory

private val SEVEN_LOCALES = listOf("", "-fr", "-es", "-pt", "-de", "-it", "-ar")

private fun resDir(): File {
    val fromModule = File("src/main/res")
    if (fromModule.isDirectory) return fromModule
    val fromRoot = File("feature/conversations/src/main/res")
    check(fromRoot.isDirectory) { "res dir of :feature:conversations not found from ${File("").absolutePath}" }
    return fromRoot
}

private fun pluralItems(folder: String, name: String): Map<String, String> {
    val file = File(resDir(), "values$folder/strings_generated.xml")
    check(file.isFile) { "missing ${file.path}" }
    val document = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(file)
    val plurals = document.getElementsByTagName("plurals")
    for (index in 0 until plurals.length) {
        val node = plurals.item(index)
        if (node.attributes.getNamedItem("name").nodeValue != name) continue
        val items = node.childNodes
        return (0 until items.length).map { items.item(it) }
            .filter { it.nodeName == "item" }
            .associate { it.attributes.getNamedItem("quantity").nodeValue to it.textContent }
    }
    error("plurals $name absent de values$folder")
}

private fun generatedNames(folder: String): Set<String> {
    val document = DocumentBuilderFactory.newInstance().newDocumentBuilder()
        .parse(File(resDir(), "values$folder/strings_generated.xml"))
    return listOf("string", "plurals").flatMap { tag ->
        val nodes = document.getElementsByTagName(tag)
        (0 until nodes.length).map { nodes.item(it).attributes.getNamedItem("name").nodeValue }
    }.toSet()
}

private fun handWrittenNames(folder: String): Set<String> =
    File(resDir(), "values$folder").listFiles { file -> file.name.endsWith(".xml") && file.name != "strings_generated.xml" }
        .orEmpty()
        .flatMap { file ->
            val document = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(file)
            val strings = document.getElementsByTagName("string")
            (0 until strings.length).map { strings.item(it).attributes.getNamedItem("name").nodeValue }
        }
        .toSet()

class ConversationsStringsContractTest {

    private val pluralNames = listOf("global_search_members", "my_share_links_joined_count")

    private val cldrQuantities = mapOf(
        "" to setOf("one", "other"),
        "-fr" to setOf("one", "many", "other"),
        "-es" to setOf("one", "many", "other"),
        "-pt" to setOf("one", "many", "other"),
        "-de" to setOf("one", "other"),
        "-it" to setOf("one", "many", "other"),
        "-ar" to setOf("zero", "one", "two", "few", "many", "other"),
    )

    @Test
    fun `both counters are plurals in the seven locales with the CLDR quantities of each language`() {
        for (folder in SEVEN_LOCALES) {
            for (name in pluralNames) {
                assertThat(pluralItems(folder, name).keys).containsAtLeastElementsIn(cldrQuantities.getValue(folder))
            }
        }
    }

    @Test
    fun `a counter keeps the same positional integer argument in every quantity that carries one`() {
        for (folder in SEVEN_LOCALES) {
            for (name in pluralNames) {
                pluralItems(folder, name).values.filter { it.contains("%") }.forEach { text ->
                    assertThat(text).containsMatch("%(1\\$)?d")
                    assertThat(text).doesNotContain("%s")
                }
            }
        }
    }

    @Test
    fun `no counter is left as a plain string`() {
        for (folder in SEVEN_LOCALES) {
            assertThat(handWrittenNames(folder)).containsNoneIn(pluralNames)
        }
    }

    @Test
    fun `no adopted name remained in a hand written file`() {
        for (folder in SEVEN_LOCALES) {
            assertThat(handWrittenNames(folder)).containsNoneIn(generatedNames(folder))
        }
    }

    @Test
    fun `values de, it and ar exist for the module and carry every hand written name of the base`() {
        val base = handWrittenNames("")
        for (folder in listOf("-de", "-it", "-ar")) {
            assertThat(File(resDir(), "values$folder").isDirectory).isTrue()
            assertThat(handWrittenNames(folder)).containsAtLeastElementsIn(base - "conversations_row_tags_overflow")
        }
    }
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ConversationsPluralsRobolectricTest {

    private fun members(tag: String, quantity: Int): String {
        val configuration = Configuration(RuntimeEnvironment.getApplication().resources.configuration)
        configuration.setLocale(Locale.forLanguageTag(tag))
        val resources: Resources = RuntimeEnvironment.getApplication().createConfigurationContext(configuration).resources
        return resources.getQuantityString(R.plurals.global_search_members, quantity, quantity)
    }

    @Test
    fun `french takes the singular for 0 and 1`() {
        assertThat(members("fr", 0)).isEqualTo("0 membre")
        assertThat(members("fr", 1)).isEqualTo("1 membre")
        assertThat(members("fr", 2)).isEqualTo("2 membres")
    }

    @Test
    fun `arabic gives each quantity its own form`() {
        val forms = listOf(0, 1, 2, 3, 11, 100).map { members("ar", it) }
        assertThat(forms[0]).isEqualTo("لا أعضاء")
        assertThat(forms[1]).isEqualTo("عضو واحد")
        assertThat(forms[2]).isEqualTo("عضوان")
        assertThat(forms[3]).isEqualTo("${arabic(3)} أعضاء")
        assertThat(forms[4]).isEqualTo("${arabic(11)} عضوًا")
        assertThat(forms[5]).isEqualTo("${arabic(100)} عضو")
    }

    /** The count as `%d` writes it under the Arabic locale — its digits belong to the platform, not to the plural. */
    private fun arabic(count: Int): String = String.format(Locale.forLanguageTag("ar"), "%d", count)

    @Test
    fun `english distinguishes one from many`() {
        assertThat(members("en", 1)).isEqualTo("1 member")
        assertThat(members("en", 100)).isEqualTo("100 members")
    }
}
