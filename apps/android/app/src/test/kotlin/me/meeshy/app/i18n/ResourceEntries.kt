package me.meeshy.app.i18n

import java.io.StringReader
import javax.xml.parsers.DocumentBuilderFactory
import org.w3c.dom.Element
import org.w3c.dom.Node
import org.xml.sax.InputSource
import org.xml.sax.SAXParseException
import org.xml.sax.helpers.DefaultHandler

internal enum class ResourceType(val label: String) {
    STRING("string"),
    PLURALS("plurals"),
    ARRAY("string-array"),
}

internal data class ResourceId(val type: ResourceType, val name: String)

internal sealed interface ResourceEntry {
    val type: ResourceType
    val name: String
    val translatable: Boolean
}

internal data class StringEntry(
    override val name: String,
    override val translatable: Boolean,
    val formatted: Boolean,
    val value: String,
) : ResourceEntry {
    override val type: ResourceType get() = ResourceType.STRING
}

internal data class PluralsEntry(
    override val name: String,
    override val translatable: Boolean,
    val items: Map<String, String>,
) : ResourceEntry {
    override val type: ResourceType get() = ResourceType.PLURALS
}

internal data class ArrayEntry(
    override val name: String,
    override val translatable: Boolean,
    val items: List<String>,
) : ResourceEntry {
    override val type: ResourceType get() = ResourceType.ARRAY
}

internal val ResourceEntry.id: ResourceId get() = ResourceId(type, name)

internal object ResourceParser {

    fun parse(xml: String): List<ResourceEntry> {
        val factory = DocumentBuilderFactory.newInstance().apply {
            runCatching { setFeature("http://apache.org/xml/features/disallow-doctype-decl", true) }
            isExpandEntityReferences = false
        }
        val builder = factory.newDocumentBuilder().apply {
            setErrorHandler(object : DefaultHandler() {
                override fun fatalError(e: SAXParseException) = throw e
            })
        }
        val root = builder.parse(InputSource(StringReader(xml))).documentElement
        return root.elements().mapNotNull(::entryOf).toList()
    }

    private fun entryOf(element: Element): ResourceEntry? {
        val name = element.getAttribute("name")
        if (name.isBlank()) return null
        val translatable = element.getAttribute("translatable") != "false"
        return when (element.tagName) {
            "string" -> StringEntry(
                name = name,
                translatable = translatable,
                formatted = element.getAttribute("formatted") != "false",
                value = element.textContent.orEmpty(),
            )
            "plurals" -> PluralsEntry(
                name = name,
                translatable = translatable,
                items = element.elements("item")
                    .associate { it.getAttribute("quantity").trim() to it.textContent.orEmpty() },
            )
            "string-array" -> ArrayEntry(
                name = name,
                translatable = translatable,
                items = element.elements("item").map { it.textContent.orEmpty() }.toList(),
            )
            else -> null
        }
    }

    private fun Element.elements(tag: String? = null): Sequence<Element> =
        generateSequence(firstChild) { it.nextSibling }
            .filter { it.nodeType == Node.ELEMENT_NODE }
            .map { it as Element }
            .filter { tag == null || it.tagName == tag }
}

internal data class FormatSpecifier(val token: String, val positional: Boolean)

internal object FormatSpecifiers {

    private val pattern = Regex("""%(\d+\$)?[-#+ 0,(<]*\d*(?:\.\d+)?[tT]?[a-zA-Z%]""")
    private val positionalPrefix = Regex("""%\d+\$.*""")
    private val argumentless = setOf('%', 'n')

    fun of(value: String): List<FormatSpecifier> =
        pattern.findAll(value)
            .map { it.value }
            .filterNot { it.last() in argumentless }
            .map { FormatSpecifier(token = it, positional = positionalPrefix.matches(it)) }
            .toList()

    fun multiset(value: String): List<String> = of(value).map { it.token }.sorted()
}

internal data class LocaleFolder(val folder: String, val language: String, val region: String?) {
    val tag: String get() = if (region == null) language else "$language-$region"
}

internal object LocaleFolders {

    const val BASE_FOLDER: String = "values"
    const val BASE_LANGUAGE: String = "en"

    private val pattern = Regex("""values-([a-z]{2,3})(?:-r([A-Z]{2}))?""")
    private val qualifiersThatLookLikeLanguages = setOf("car")

    fun parse(folder: String): LocaleFolder? {
        if (folder == BASE_FOLDER) return LocaleFolder(folder, BASE_LANGUAGE, null)
        val match = pattern.matchEntire(folder) ?: return null
        val language = match.groupValues[1]
        if (language in qualifiersThatLookLikeLanguages) return null
        return LocaleFolder(folder, language, match.groupValues[2].ifEmpty { null })
    }

    fun folderOf(tag: String): String {
        val parts = normalizeTag(tag).split('-', limit = 2)
        val language = parts[0]
        val region = parts.getOrNull(1)
        return when {
            region != null -> "values-$language-r$region"
            language == BASE_LANGUAGE -> BASE_FOLDER
            else -> "values-$language"
        }
    }

    fun normalizeTag(raw: String): String {
        val parts = raw.trim().replace('_', '-').split('-', limit = 2)
        val language = parts[0].lowercase()
        val region = parts.getOrNull(1)?.uppercase()
        return if (region.isNullOrEmpty()) language else "$language-$region"
    }
}
