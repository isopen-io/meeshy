// Génère CallFrameCatalogueGenerated.kt depuis packages/shared/design/call-capture-frames/*.json,
// la MÊME source que le web et iOS. Appliqué par :core:model et par scripts/jvm-check.
// Le fichier généré n'embarque que le texte des JSON : le dépliage (base + variantes) est fait à
// l'exécution par CallFrameCatalogue, donc rien ne peut dériver du JSON en silence.

val callFrameMoods = listOf(
    "signature", "distingue", "elegant", "jovial", "deconnecte", "corporate",
    "fantastique", "futuriste", "glauque", "hors-norme", "morbide", "feerique",
)

val callFramesSourceDir: File = generateSequence(projectDir) { it.parentFile }
    .map { File(it, "packages/shared/design/call-capture-frames") }
    .first { it.isDirectory }


abstract class GenerateCallFrameCatalogue : DefaultTask() {
    @get:InputDirectory
    @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val sourceDir: DirectoryProperty

    @get:Input
    abstract val moods: ListProperty<String>

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    private fun kotlinLiteral(text: String): String = buildString {
        append('"')
        for (c in text) {
            when {
                c == '\\' -> append("\\\\")
                c == '"' -> append("\\\"")
                c == '$' -> append("\\$")
                c == '\n' -> append("\\n")
                c == '\r' -> append("\\r")
                c == '\t' -> append("\\t")
                c.code < 0x20 || c.code > 0x7e -> append("\\u").append(c.code.toString(16).padStart(4, '0'))
                else -> append(c)
            }
        }
        append('"')
    }

    @TaskAction
    fun generate() {
        val out = File(outputDir.get().asFile, "me/meeshy/sdk/model/call/frames/CallFrameCatalogueGenerated.kt")
        out.parentFile.mkdirs()
        val entries = moods.get().joinToString(",\n") { mood ->
            val file = File(sourceDir.get().asFile, "$mood.json")
            require(file.isFile) { "ambiance sans fichier : $file" }
            "        ${kotlinLiteral(mood)} to ${kotlinLiteral(file.readText(Charsets.UTF_8))}"
        }
        out.writeText(
            "// GÉNÉRÉ — ne pas éditer ; source : packages/shared/design/call-capture-frames\n" +
                "// Régénéré par la tâche Gradle generateCallFrameCatalogue.\n" +
                "package me.meeshy.sdk.model.call.frames\n\n" +
                "internal object CallFrameCatalogueGenerated {\n" +
                "    /** Les douze fichiers d'ambiance, dans l'ordre canonique : ambiance to texte JSON. */\n" +
                "    val moodFiles: List<Pair<String, String>> = listOf(\n$entries,\n    )\n}\n",
            Charsets.UTF_8,
        )
    }
}

val generateCallFrameCatalogue = tasks.register<GenerateCallFrameCatalogue>("generateCallFrameCatalogue") {
    group = "build"
    description = "Génère CallFrameCatalogueGenerated.kt depuis les JSON partagés des cadres d'appel."
    sourceDir.set(callFramesSourceDir)
    moods.set(callFrameMoods)
    outputDir.set(layout.buildDirectory.dir("generated/callframes"))
}
