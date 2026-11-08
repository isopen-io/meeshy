package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.fileviewer.CodeLanguage
import org.junit.Test

class CodeLanguageDetectorTest {

    @Test
    fun `l'extension decide d'abord`() {
        assertThat(CodeLanguageDetector.detect("main.rs", "text/plain")).isEqualTo(CodeLanguage.RUST)
        assertThat(CodeLanguageDetector.detect("App.TSX", "")).isEqualTo(CodeLanguage.TYPESCRIPT)
    }

    @Test
    fun `le type MIME prend le relais sans extension`() {
        assertThat(CodeLanguageDetector.detect("snippet", "text/x-python; charset=utf-8")).isEqualTo(CodeLanguage.PYTHON)
        assertThat(CodeLanguageDetector.detect("snippet", "text/x-kotlin")).isEqualTo(CodeLanguage.KOTLIN)
        assertThat(CodeLanguageDetector.detect("snippet", "application/x-httpd-php")).isEqualTo(CodeLanguage.PHP)
    }

    @Test
    fun `un nom de fichier connu vaut son langage`() {
        assertThat(CodeLanguageDetector.detect("Dockerfile", "")).isEqualTo(CodeLanguage.DOCKERFILE)
    }

    @Test
    fun `un texte ordinaire n'est pas du code`() {
        assertThat(CodeLanguageDetector.detect("notes.txt", "text/plain")).isNull()
    }
}
