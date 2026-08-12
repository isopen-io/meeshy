package me.meeshy.app.settings

import java.io.File

/**
 * Pure, directory-agnostic cache arithmetic: recursively measure a directory's byte size and wipe
 * its contents. Operates on any opaque [File] (no Android dependency, no knowledge of which cache a
 * directory belongs to), so it is exercised directly against temp directories in the JVM tests.
 * A missing directory reads as zero bytes and clears as a no-op — the caller never has to
 * pre-create folders.
 */
object MediaCacheScanner {

    /** Total size in bytes of every regular file under [directory], or 0 if it does not exist. */
    fun sizeOf(directory: File): Long {
        if (!directory.exists()) return 0L
        return directory.walkTopDown()
            .filter { it.isFile }
            .sumOf { it.length() }
    }

    /** Delete everything inside [directory] but keep the directory itself. Inert if absent. */
    fun clear(directory: File) {
        if (!directory.exists()) return
        directory.listFiles()?.forEach { it.deleteRecursively() }
    }
}
