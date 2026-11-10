package me.meeshy.feature.kit

import java.io.File

/** Où vivent le dépôt et le projet Android, vus depuis le répertoire de travail d'un test Gradle (le module) ou de l'IDE. */
internal object KitRepository {
    val androidRoot: File by lazy {
        val start = File("").absoluteFile
        generateSequence(start) { it.parentFile }
            .firstOrNull { File(it, "settings.gradle.kts").isFile && File(it, "sdk-ui").isDirectory }
            ?: File(start, "apps/android").also { check(it.isDirectory) { "racine du projet Android introuvable depuis ${start.absolutePath}" } }
    }

    val repositoryRoot: File by lazy { androidRoot.parentFile.parentFile }

    val registry: File get() = File(repositoryRoot, ".claude/workflows/meeshy-kit-planche.lots.json")
    val board: File get() = File(repositoryRoot, "docs/product/composer-vue-finale/planche.html")
    val snapshots: File get() = File(androidRoot, "feature/kit/src/test/snapshots")
}
