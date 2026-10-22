package me.meeshy.app.i18n

import java.io.File

// Reads the REAL tree of apps/android for the guards: which Gradle modules exist, the
// values*/ resource files of those that carry strings, their Kotlin sources, and the
// small text files (shipped locales, recorded gaps, hardcoded baseline) kept next to the tests.

internal data class GradleModule(val path: String, val dir: File)

internal data class KotlinSource(val path: String, val text: String)

internal object ResourceTree {

    private val includePattern = Regex("""include\(\s*"([^"]+)"\s*\)""")

    fun androidRoot(start: File = File("").absoluteFile): File =
        generateSequence(start) { it.parentFile }
            .firstOrNull { File(it, "settings.gradle.kts").isFile }
            ?: error("settings.gradle.kts introuvable en remontant depuis ${start.path}")

    fun gradleModules(root: File = androidRoot()): List<GradleModule> =
        includePattern.findAll(File(root, "settings.gradle.kts").readText())
            .map { it.groupValues[1] }
            .map { path -> GradleModule(path, File(root, path.removePrefix(":").replace(':', '/'))) }
            .toList()

    fun stringModules(root: File = androidRoot()): List<ModuleResources> =
        gradleModules(root).mapNotNull { module ->
            val files = resourceFiles(module.dir)
            val carriesStrings = files.any { ResourceParser.parse(it.text).isNotEmpty() }
            if (carriesStrings) ModuleResources(module.path, files) else null
        }

    private fun resourceFiles(moduleDir: File): List<ResourceFile> =
        File(moduleDir, "src/main/res").listFiles { dir -> dir.isDirectory && dir.name.startsWith("values") }
            .orEmpty()
            .sortedBy { it.name }
            .flatMap { folder ->
                folder.listFiles { file -> file.isFile && file.extension == "xml" }
                    .orEmpty()
                    .sortedBy { it.name }
                    .map { ResourceFile(folder.name, it.name, it.readText(Charsets.UTF_8)) }
            }

    fun kotlinSources(root: File = androidRoot()): List<KotlinSource> =
        gradleModules(root).flatMap { module ->
            listOf("src/main/kotlin", "src/main/java").flatMap { sourceSet ->
                File(module.dir, sourceSet).takeIf { it.isDirectory }
                    ?.walkTopDown()
                    ?.filter { it.isFile && it.extension == "kt" }
                    ?.map { KotlinSource(it.relativeTo(root).invariantSeparatorsPath, it.readText(Charsets.UTF_8)) }
                    ?.toList()
                    .orEmpty()
            }
        }.sortedBy { it.path }

    fun testData(name: String): String {
        val stream = ResourceTree::class.java.getResourceAsStream("/i18n/$name")
            ?: error("ressource de test introuvable : i18n/$name")
        return stream.bufferedReader(Charsets.UTF_8).use { it.readText() }
    }
}
