package me.meeshy.app.settings

import java.io.File

internal data class ResEntry(val name: String, val isPlural: Boolean, val text: String, val quantities: Map<String, String>)

internal object SettingsResourceTree {

    val locales: List<String> = listOf("fr", "es", "pt", "de", "it", "ar")
    val exemptedLegalLocales: List<String> = listOf("de", "it", "ar")

    private val stringPattern = Regex("""<string\s+name="([^"]+)"([^>]*)>(.*?)</string>""", RegexOption.DOT_MATCHES_ALL)
    private val pluralsPattern = Regex("""<plurals\s+name="([^"]+)"[^>]*>(.*?)</plurals>""", RegexOption.DOT_MATCHES_ALL)
    private val itemPattern = Regex("""<item\s+quantity="(\w+)">(.*?)</item>""", RegexOption.DOT_MATCHES_ALL)
    private val specifierPattern = Regex("""%(?:\d+\$)?[sd]""")

    fun androidRoot(start: File = File("").absoluteFile): File =
        generateSequence(start) { it.parentFile }.first { File(it, "settings.gradle.kts").isFile }

    private fun moduleDir(): File = File(androidRoot(), "feature/settings")

    fun resDir(): File = File(moduleDir(), "src/main/res")

    fun kotlinSources(): List<File> =
        File(moduleDir(), "src/main/kotlin").walkTopDown().filter { it.isFile && it.extension == "kt" }.toList()

    fun folder(locale: String?): String = if (locale == null) "values" else "values-$locale"

    fun files(locale: String?): List<File> =
        File(resDir(), folder(locale)).listFiles { f -> f.isFile && f.extension == "xml" }.orEmpty().sortedBy { it.name }

    fun entries(file: File): List<ResEntry> {
        val text = file.readText(Charsets.UTF_8)
        val plurals = pluralsPattern.findAll(text).map { match ->
            ResEntry(
                name = match.groupValues[1],
                isPlural = true,
                text = match.groupValues[2],
                quantities = itemPattern.findAll(match.groupValues[2]).associate { it.groupValues[1] to it.groupValues[2] },
            )
        }.toList()
        val withoutPlurals = pluralsPattern.replace(text, "")
        val strings = stringPattern.findAll(withoutPlurals)
            .filterNot { it.groupValues[2].contains("translatable=\"false\"") }
            .map { ResEntry(it.groupValues[1], false, it.groupValues[3], emptyMap()) }
            .toList()
        return strings + plurals
    }

    fun entriesOf(locale: String?, onlyFile: String? = null): Map<String, ResEntry> =
        files(locale).filter { onlyFile == null || it.name == onlyFile }.flatMap(::entries).associateBy { it.name }

    fun specifiers(text: String): List<String> = specifierPattern.findAll(text).map { it.value }.sorted().toList()

    fun requiredQuantities(locale: String): Set<String> = when (locale) {
        "ar" -> setOf("zero", "one", "two", "few", "many", "other")
        "fr", "es", "pt", "it" -> setOf("one", "many", "other")
        else -> setOf("one", "other")
    }
}
