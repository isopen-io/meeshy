package me.meeshy.app.i18n

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Assert.assertThrows
import org.junit.Test

// Garde de la table de correspondance des chaînes (apps/android/i18n/manifest) : chaque nom des
// strings.xml écrits à la main est classé dans le manifeste de son module (aucun orphelin), aucun nom
// n'est déclaré deux fois, et une clé `adopted` vit dans le XML GÉNÉRÉ du module, jamais dans un
// strings.xml (le générateur refuse une double définition). La détection est prouvée sur des
// fragments synthétiques ; le test de l'arbre réel l'applique aux treize modules.
class StringManifestIntegrityTest {

    private fun entry(name: String, status: String = "candidate") = ManifestEntry(name, null, status)

    private fun module(vararg entries: ManifestEntry) = ManifestModule(":feature:demo", "feature/demo/src/main/res", entries.toList())

    private fun check(
        module: ManifestModule,
        handWritten: Set<String> = emptySet(),
        generated: Set<String> = emptySet(),
    ) = StringManifestRules.check(module, handWritten, generated)

    @Test
    fun `a hand written name missing from the manifest is an orphan`() {
        val findings = check(module(entry("a")), handWritten = setOf("a", "b"))

        assertThat(findings).hasSize(1)
        assertThat(findings.single()).contains("orphelin")
        assertThat(findings.single()).contains("b")
    }

    @Test
    fun `a name declared twice in a module is a duplicate`() {
        val findings = check(module(entry("a"), entry("a", "android-only")), handWritten = setOf("a"))

        assertThat(findings.single()).contains("doublon")
    }

    @Test
    fun `the name defaults to the ios key with dots and dashes replaced`() {
        val derived = ManifestEntry(null, "chat.read-all", "candidate")

        assertThat(derived.resolvedName).isEqualTo("chat_read_all")
        assertThat(check(module(derived, entry("chat_read_all")))).hasSize(1)
    }

    @Test
    fun `an adopted name still defined in strings xml fails`() {
        val findings = check(module(entry("a", "adopted")), handWritten = setOf("a"), generated = setOf("a"))

        assertThat(findings.single()).contains("adopted")
        assertThat(findings.single()).contains("strings.xml")
    }

    @Test
    fun `an adopted name absent from the generated xml fails`() {
        val findings = check(module(entry("a", "adopted")))

        assertThat(findings.single()).contains("XML généré")
    }

    @Test
    fun `an adopted name that is generated and not hand written is clean`() {
        assertThat(check(module(entry("a", "adopted")), generated = setOf("a"))).isEmpty()
    }

    @Test
    fun `an unknown status fails`() {
        assertThat(check(module(entry("a", "maybe"))).single()).contains("statut")
    }

    @Test
    fun `invalid json fails with the file name`() {
        val error = assertThrows(IllegalStateException::class.java) { StringManifests.parse("{ nope", "demo.json") }

        assertThat(error.message).contains("demo.json")
    }

    @Test
    fun `fragments of the same module are merged`() {
        val first = """{"schemaVersion":1,"modules":{":feature:demo":{"resDir":"feature/demo/src/main/res","entries":[{"androidName":"a","status":"android-only"}]}}}"""
        val second = """{"schemaVersion":1,"modules":{":feature:demo":{"resDir":"feature/demo/src/main/res","entries":[{"catalog":"app","iosKey":"x.y","status":"adopted"}]}}}"""

        val merged = StringManifests.merge(listOf(StringManifests.parse(first, "a.json"), StringManifests.parse(second, "b.json")))

        assertThat(merged.single().entries.map { it.resolvedName }).containsExactly("a", "x_y")
    }

    @Test
    fun `the real manifests classify every hand written string of the thirteen modules`() {
        val root = ResourceTree.androidRoot()
        val modules = StringManifests.load(File(root, "i18n/manifest"))

        assertThat(modules.map { it.module }).containsAtLeast(
            ":app", ":sdk-ui", ":feature:auth", ":feature:calls", ":feature:chat", ":feature:contacts",
            ":feature:conversations", ":feature:feed", ":feature:notifications", ":feature:profile",
            ":feature:reels", ":feature:settings", ":feature:stories",
        )
        val findings = modules.flatMap { manifest ->
            val values = File(root, "${manifest.resDir}/values")
            val handWritten = namesIn(values) { it.name != GENERATED }
            val generated = namesIn(values) { it.name == GENERATED }
            check(manifest, handWritten, generated)
        }
        assertWithMessage(findings.joinToString("\n")).that(findings).isEmpty()
    }

    private fun namesIn(folder: File, accept: (File) -> Boolean): Set<String> =
        folder.listFiles { file -> file.isFile && file.extension == "xml" && accept(file) }
            .orEmpty()
            .flatMap { ResourceParser.parse(it.readText(Charsets.UTF_8)) }
            .map { it.name }
            .toSet()

    private companion object {
        const val GENERATED = "strings_generated.xml"
    }
}

internal data class ManifestEntry(val androidName: String?, val iosKey: String?, val status: String) {
    val resolvedName: String get() = androidName ?: iosKey.orEmpty().replace('.', '_').replace('-', '_')
}

internal data class ManifestModule(val module: String, val resDir: String, val entries: List<ManifestEntry>)

internal object StringManifestRules {

    private val statuses = setOf("adopted", "candidate", "android-only", "disabled")

    fun check(module: ManifestModule, handWritten: Set<String>, generated: Set<String>): List<String> {
        val names = module.entries.map { it.resolvedName }
        val duplicates = names.groupingBy { it }.eachCount().filterValues { it > 1 }.keys.sorted()
            .map { "${module.module} : doublon du nom « $it » dans le manifeste" }
        val statusFindings = module.entries.filter { it.status !in statuses }
            .map { "${module.module} : statut « ${it.status} » inconnu pour « ${it.resolvedName} »" }
        val adopted = module.entries.filter { it.status == "adopted" }.map { it.resolvedName }.distinct().sorted()
        val adoptedFindings = adopted.flatMap { name ->
            listOfNotNull(
                "${module.module} : « $name » est adopted mais absent du XML généré".takeIf { name !in generated },
                "${module.module} : « $name » est adopted mais encore défini dans un strings.xml".takeIf { name in handWritten },
            )
        }
        val orphans = (handWritten - names.toSet()).sorted()
            .map { "${module.module} : orphelin « $it » — défini à la main, absent du manifeste" }
        return duplicates + statusFindings + adoptedFindings + orphans
    }
}

internal object StringManifests {

    fun load(folder: File): List<ManifestModule> =
        merge(
            folder.walkTopDown().filter { it.isFile && it.extension == "json" }.sortedBy { it.path }
                .map { parse(it.readText(Charsets.UTF_8), it.name) }.toList(),
        )

    fun merge(documents: List<List<ManifestModule>>): List<ManifestModule> =
        documents.flatten().groupBy { it.module }.map { (name, parts) ->
            ManifestModule(name, parts.first().resDir, parts.flatMap { it.entries })
        }.sortedBy { it.module }

    fun parse(text: String, source: String): List<ManifestModule> {
        val root = runCatching { MiniJson(text).parse() }
            .getOrElse { error("$source : JSON invalide — ${it.message}") } as? Map<*, *>
            ?: error("$source : un objet JSON est attendu")
        val modules = root["modules"] as? Map<*, *> ?: error("$source : « modules » manquant")
        return modules.map { (name, raw) ->
            val module = raw as? Map<*, *> ?: error("$source : module $name illisible")
            val entries = (module["entries"] as? List<*> ?: error("$source : « entries » manquant pour $name")).map { item ->
                val fields = item as? Map<*, *> ?: error("$source : entrée illisible dans $name")
                ManifestEntry(
                    androidName = fields["androidName"] as? String,
                    iosKey = fields["iosKey"] as? String,
                    status = fields["status"] as? String ?: error("$source : entrée sans statut dans $name"),
                )
            }
            ManifestModule(name.toString(), module["resDir"] as? String ?: error("$source : resDir manquant"), entries)
        }
    }
}

// Lecteur JSON minimal : :app n'embarque pas de bibliothèque JSON pour ses tests.
private class MiniJson(private val text: String) {
    private var index = 0

    fun parse(): Any? = value().also {
        skipBlanks()
        check(index == text.length) { "texte superflu à la position $index" }
    }

    private fun skipBlanks() {
        while (index < text.length && text[index].isWhitespace()) index++
    }

    private fun value(): Any? {
        skipBlanks()
        check(index < text.length) { "fin inattendue" }
        return when (val char = text[index]) {
            '{' -> obj()
            '[' -> array()
            '"' -> string()
            't', 'f', 'n' -> literal()
            else -> if (char == '-' || char.isDigit()) number() else error("caractère inattendu « $char » à la position $index")
        }
    }

    private fun obj(): Map<String, Any?> {
        val result = linkedMapOf<String, Any?>()
        index++
        skipBlanks()
        if (peek() == '}') return result.also { index++ }
        while (true) {
            skipBlanks()
            val key = string()
            skipBlanks()
            expect(':')
            result[key] = value()
            skipBlanks()
            if (peek() == ',') index++ else return result.also { expect('}') }
        }
    }

    private fun array(): List<Any?> {
        val result = mutableListOf<Any?>()
        index++
        skipBlanks()
        if (peek() == ']') return result.also { index++ }
        while (true) {
            result += value()
            skipBlanks()
            if (peek() == ',') index++ else return result.also { expect(']') }
        }
    }

    private fun string(): String {
        expect('"')
        val out = StringBuilder()
        while (true) {
            check(index < text.length) { "chaîne non terminée" }
            val char = text[index++]
            when (char) {
                '"' -> return out.toString()
                '\\' -> out.append(escape())
                else -> out.append(char)
            }
        }
    }

    private fun escape(): Char {
        check(index < text.length) { "échappement non terminé" }
        return when (val code = text[index++]) {
            'n' -> '\n'
            't' -> '\t'
            'r' -> '\r'
            'b' -> '\b'
            'f' -> '\u000C'
            'u' -> text.substring(index, index + 4).toInt(16).toChar().also { index += 4 }
            else -> code
        }
    }

    private fun literal(): Any? {
        for ((word, result) in listOf("true" to true, "false" to false, "null" to null)) {
            if (text.startsWith(word, index)) return result.also { index += word.length }
        }
        error("littéral inconnu à la position $index")
    }

    private fun number(): Double {
        val start = index
        while (index < text.length && (text[index].isDigit() || text[index] in "+-.eE")) index++
        return text.substring(start, index).toDouble()
    }

    private fun peek(): Char? = text.getOrNull(index)

    private fun expect(char: Char) {
        check(peek() == char) { "« $char » attendu à la position $index" }
        index++
    }
}
