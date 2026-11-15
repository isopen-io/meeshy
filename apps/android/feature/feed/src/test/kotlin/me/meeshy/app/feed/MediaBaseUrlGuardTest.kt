package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * `resolveMediaUrl` composes `<apiBaseUrl>/attachments/file/<key>`: fed the SOCKET origin
 * (`https://gate.meeshy.me`, no `/api/v1`), every stored key 404s — the post detail, the
 * comments, the saved, nearby and profile post lists and the reels all lost their photos,
 * avatars and videos while the feed (fed `apiBaseUrl`) showed them. No feed or reels
 * projection may resolve media against `socketUrl`.
 */
class MediaBaseUrlGuardTest {

    private fun moduleRoot(name: String): File {
        val here = File("").absoluteFile
        val android = generateSequence(here) { it.parentFile }.first { File(it, "settings.gradle.kts").isFile }
        return File(android, "feature/$name/src/main/kotlin")
    }

    @Test
    fun `no feed or reels projection resolves media against the socket origin`() {
        val offenders = listOf("feed", "reels").flatMap { module ->
            moduleRoot(module).walkTopDown()
                .filter { it.isFile && it.extension == "kt" }
                .filter { file -> file.readLines().any { "config.socketUrl" in it } }
                .map { it.name }
                .toList()
        }

        assertThat(offenders).isEmpty()
    }
}
