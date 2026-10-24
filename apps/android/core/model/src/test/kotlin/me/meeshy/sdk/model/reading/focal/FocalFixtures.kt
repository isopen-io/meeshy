package me.meeshy.sdk.model.reading.focal

import java.io.File

internal object FocalFixtures {
    fun file(relative: String): File {
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val candidate = File(dir, "packages/shared/fixtures/$relative")
            if (candidate.isFile) return candidate
            dir = dir.parentFile
        }
        error("fixture introuvable en remontant depuis ${File("").absolutePath}: $relative")
    }
}
